const { createClient } = require('@supabase/supabase-js');

// Pakai SERVICE_ROLE biar bisa createSignedUrl
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('SUPABASE_URL atau KEY belum di set di .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Daftar bucket yang mungkin dipakai di project kamu - urut prioritas
const CANDIDATE_BUCKETS = [
  process.env.SUPABASE_BUCKET_FOTO,
  'foto-absensi',
  'absensi',
  'foto'
].filter(Boolean);

function getPublicUrl(bucket, path) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

async function buatSignedUrlFotoBatch(paths) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  const map = new Map();

  if (uniquePaths.length === 0) return map;

  for (const path of uniquePaths) {
    // skip kalau sudah http / data:
    if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('/uploads/')) {
      map.set(path, path);
      continue;
    }

    let foundUrl = null;

    // Coba semua bucket candidate
    for (const bucket of CANDIDATE_BUCKETS) {
      try {
        // 1. coba signed URL (untuk private bucket)
        const { data: signed, error: errSigned } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7); // 7 hari
        if (!errSigned && signed?.signedUrl) {
          foundUrl = signed.signedUrl;
          console.log(`[foto] OK signed ${bucket}/${path}`);
          break;
        } else if (errSigned) {
          console.error(`[foto-debug] createSignedUrl gagal di bucket ${bucket}:`, errSigned.message || errSigned);
        }

        // 2. fallback public URL
        const publicUrl = getPublicUrl(bucket, path);
        if (publicUrl) {
          try {
            const headRes = await fetch(publicUrl, { method: 'HEAD' });
            if (headRes.ok) {
              foundUrl = publicUrl;
              console.log(`[foto] OK public fallback ${bucket}/${path}`);
              break;
            } else {
               console.error(`[foto-debug] HEAD request gagal di bucket ${bucket} dengan status: ${headRes.status}`);
            }
          } catch(err) {
             console.error(`[foto-debug] fetch HEAD error di bucket ${bucket}:`, err.message);
          }
        }
      } catch (e) {
        console.error(`[foto] error bucket ${bucket} path ${path}`, e.message);
      }
    }

    if (!foundUrl) {
      console.error(`[foto] file tidak ketemu di semua bucket (atau gagal signed) untuk path: ${path}`);
      const fallbackBucket = CANDIDATE_BUCKETS[0] || 'foto-absensi';
      foundUrl = getPublicUrl(fallbackBucket, path);
    }

    if (foundUrl) map.set(path, foundUrl);
  }

  console.log(`[foto] buatSignedUrlFotoBatch: ${map.size}/${uniquePaths.length} berhasil`);
  return map;
}

module.exports = { buatSignedUrlFotoBatch, getPublicUrl };
