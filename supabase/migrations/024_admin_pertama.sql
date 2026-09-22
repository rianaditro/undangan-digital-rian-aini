-- 024 — membuka admin yang PERTAMA.
--
-- Masalah ayam-dan-telur: /admin menolak siapa pun yang tidak ada di
-- tabel `admin`, dan satu-satunya jalan membuat akun — edge function
-- admin-pasangan — juga menuntut pemanggilnya sudah admin. Selama
-- tabelnya kosong, tidak ada jalan masuk sama sekali.
--
-- Jalan keluarnya satu fungsi yang HANYA bekerja selagi tabel `admin`
-- masih kosong. Sesudah admin pertama ada, fungsi ini mati sendiri;
-- admin berikutnya dibuat lewat jalan biasa. Jadi ia bukan pintu
-- belakang yang menganga, melainkan pintu yang mengunci diri begitu
-- dilewati sekali.
--
-- Kenapa akunnya dibuat lewat SQL dan bukan lewat Auth Admin API:
-- API itu menuntut service_role, dan service_role tidak boleh ada di
-- mana pun kecuali di dalam edge function. Yang tersisa cuma SQL.
-- Bentuk barisnya disalin dari yang dibuat GoTrue sendiri, dan sudah
-- diuji: sandinya terverifikasi ulang oleh bcrypt yang sama,
-- confirmed_at terisi, identitas email tersambung, dan is_admin()
-- mengenalinya.
--
-- Berkas ini TIDAK memuat email maupun sandi siapa pun. Keduanya
-- diserahkan waktu fungsinya dipanggil, sekali, di luar repo.

create or replace function public.admin_pertama(
  p_email text,
  p_sandi text,
  p_nama  text default null
) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  uid     uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  -- Penjaga yang membuat fungsi ini aman dibiarkan hidup.
  if exists (select 1 from public.admin) then
    raise exception 'Sudah ada admin — fungsi ini hanya untuk yang pertama'
      using errcode = '22023';
  end if;

  if v_email !~ '^[^@\s]+@[^@\s.]+\.[^@\s]+$' then
    raise exception 'Email tidak sah' using errcode = '22023';
  end if;
  if char_length(coalesce(p_sandi, '')) < 12 then
    raise exception 'Kata sandi minimal 12 huruf' using errcode = '22023';
  end if;

  select u.id into uid from auth.users u where lower(u.email) = v_email;

  if uid is null then
    uid := gen_random_uuid();

    -- Empat kolom token diisi string kosong, bukan dibiarkan NULL.
    -- GoTrue membacanya sebagai string dan gagal memindai NULL — akunnya
    -- terbentuk, tapi setiap percobaan masuk berakhir galat 500 yang
    -- tidak menyebut sebabnya.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      v_email,
      extensions.crypt(p_sandi, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
      '', '', '', ''
    );

    -- Tanpa baris identitas, akunnya ada tapi tidak punya cara masuk:
    -- GoTrue mencari penyedia 'email' di sini, bukan di auth.users.
    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      uid::text, uid,
      jsonb_build_object('sub', uid::text, 'email', v_email,
                         'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    );
  end if;

  insert into public.admin (user_id, nama)
  values (uid, coalesce(nullif(btrim(p_nama), ''), split_part(v_email, '@', 1)));

  return uid;
end $$;

-- Sama seperti pasangan_siapkan: PUBLIC, anon, dan authenticated dicabut
-- satu per satu. `revoke from public` saja tidak cukup — default
-- privileges Supabase memberi execute ke anon dan authenticated sebagai
-- grant tersendiri.
revoke all on function public.admin_pertama(text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_pertama(text, text, text) to service_role;
