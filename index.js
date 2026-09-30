/**
 * Fuente Cuevana — Extracción directa HLS (.m3u8) / MP4
 * getStreams + extract con resolvers de Embed69/Nuvio (VOE, StreamWish, VidHide)
 */

var TMDB_KEY = 'a2d9bbed370d9f678e34006f8750a5a5';
var TMDB = 'https://api.themoviedb.org/3';
var BASE = 'https://wv3.cuevana3.eu';
var UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

var ALLOWED = [
  'streamwish', 'vidhide', 'filelions', 'vidhidepro',
  'streamwish.to', 'vidhidepro.com', 'filelions.com', 'filelions.to',
  'voe', 'dood', 'ok.ru', 'filemoon', 'hlswish', 'hglink', 'awish',
  'strwish', 'wishfast', 'hanerix', 'embedwish', 'callistanise',
  'playnixes', 'hgplaycdn', 'minochinos', 'vadisov', 'vaiditv',
  'vibuxer', 'premilkyway', 'dintezuvio', 'dramiyos', 'wishembed'
];

// Map de dominios que rotan
var DOMAIN_MAP = {
  'streamwish.to': 'vibuxer.com',
  'hglink.to': 'vibuxer.com',
  'streamwish.com': 'vibuxer.com',
  'filelions.to': 'callistanise.com',
  'filelions.com': 'callistanise.com',
  'vidhidepro.com': 'callistanise.com',
  'vidhide.com': 'callistanise.com'
};

// ─── HELPERS ─────────────────────────────────────────────
async function httpGet(url, headers) {
  try {
    var h = Object.assign(
      {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9',
      },
      headers || {}
    );
    var res = await fetch(url, { headers: h, redirect: 'follow' });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    return null;
  }
}

async function httpGetJson(url) {
  try {
    var res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function slugify(title) {
  var s = String(title || '').trim().toLowerCase();
  var map = {
    á: 'a', à: 'a', ä: 'a', â: 'a', ã: 'a',
    é: 'e', è: 'e', ë: 'e', ê: 'e',
    í: 'i', ì: 'i', ï: 'i', î: 'i',
    ó: 'o', ò: 'o', ö: 'o', ô: 'o', õ: 'o',
    ú: 'u', ù: 'u', ü: 'u', û: 'u',
    ñ: 'n', ç: 'c',
  };
  Object.keys(map).forEach(function (k) {
    s = s.split(k).join(map[k]);
  });
  s = s.replace(/[^a-z0-9\s-]/g, '').replace(/[\s-]+/g, '-');
  return s.replace(/^-+|-+$/g, '');
}

function langCode(language) {
  var lang = String(language || '').toLowerCase();
  if (lang.indexOf('castellano') >= 0 || lang.indexOf('españa') >= 0) return 'es_ES';
  if (lang.indexOf('ingl') >= 0 || lang.indexOf('english') >= 0 || lang.indexOf('sub') >= 0)
    return 'en_US';
  if (lang.indexOf('japon') >= 0) return 'ja_JA';
  return 'es_MX';
}

function isAllowed(name) {
  var n = String(name || '').toLowerCase();
  for (var i = 0; i < ALLOWED.length; i++) {
    if (n.indexOf(ALLOWED[i]) >= 0) return true;
  }
  return false;
}

function mapDomain(url) {
  if (!url) return url;
  var out = String(url);
  try {
    var u = new URL(out);
    var host = u.host.toLowerCase();
    Object.keys(DOMAIN_MAP).forEach(function (k) {
      if (host.indexOf(k) >= 0) {
        u.host = host.split(k).join(DOMAIN_MAP[k]);
      }
    });
    return u.toString();
  } catch (e) {
    Object.keys(DOMAIN_MAP).forEach(function (k) {
      if (out.indexOf(k) >= 0) out = out.split(k).join(DOMAIN_MAP[k]);
    });
    return out;
  }
}

function detectServer(url) {
  var s = String(url || '').toLowerCase();
  if (
    s.indexOf('voe') >= 0 ||
    s.indexOf('cloudwindow') >= 0 ||
    s.indexOf('marissashare') >= 0
  )
    return 'voe';
  if (
    s.indexOf('streamwish') >= 0 ||
    s.indexOf('hlswish') >= 0 ||
    s.indexOf('hglink') >= 0 ||
    s.indexOf('filelions') >= 0 ||
    s.indexOf('vibuxer') >= 0 ||
    s.indexOf('premilkyway') >= 0 ||
    s.indexOf('wishembed') >= 0 ||
    s.indexOf('awish') >= 0 ||
    s.indexOf('strwish') >= 0 ||
    s.indexOf('wishfast') >= 0 ||
    s.indexOf('hanerix') >= 0 ||
    s.indexOf('embedwish') >= 0
  )
    return 'streamwish';
  if (
    s.indexOf('vidhide') >= 0 ||
    s.indexOf('minochinos') >= 0 ||
    s.indexOf('dintezuvio') >= 0 ||
    s.indexOf('dramiyos') >= 0 ||
    s.indexOf('callistanise') >= 0 ||
    s.indexOf('vadisov') >= 0 ||
    s.indexOf('vaiditv') >= 0
  )
    return 'vidhide';
  if (s.indexOf('dood') >= 0 || s.indexOf('ds2play') >= 0 || s.indexOf('ds2video') >= 0)
    return 'doodstream';
  return 'unknown';
}

// ─── QUALITY HELPERS (del extractor de referencia) ───────
var QUALITY_MAPS = {
  vimeos: { h: '720p', n: '480p' },
  goodstream: { x: '1080p', h: '720p', n: '480p', l: '360p' },
  vidhide: { n: '720p', l: '480p' },
  streamwish: { x: '1080p', h: '1080p', n: '720p', l: '480p' },
  voe: { n: '720p', l: '360p' },
};
var QUALITY_ORDER = ['x', 'o', 'h', 'n', 'l'];

function qualityMapForUrl(url) {
  if (url.indexOf('vimeos') >= 0) return QUALITY_MAPS.vimeos;
  if (url.indexOf('goodstream') >= 0) return QUALITY_MAPS.goodstream;
  if (url.indexOf('cloudwindow') >= 0) return QUALITY_MAPS.voe;
  if (
    url.indexOf('minochinos') >= 0 ||
    url.indexOf('vidhide') >= 0 ||
    url.indexOf('dintezuvio') >= 0 ||
    url.indexOf('dramiyos') >= 0
  )
    return QUALITY_MAPS.vidhide;
  if (
    url.indexOf('premilkyway') >= 0 ||
    url.indexOf('hlswish') >= 0 ||
    url.indexOf('vibuxer') >= 0 ||
    url.indexOf('streamwish') >= 0
  )
    return QUALITY_MAPS.streamwish;
  return null;
}

function detectQualityFromUrl(url) {
  if (!url) return 'Unknown';
  var map = qualityMapForUrl(url);
  if (map) {
    var m = url.match(/_,([a-z,]+),\.urlset/);
    if (m) {
      var parts = m[1].split(',').filter(Boolean);
      for (var i = 0; i < QUALITY_ORDER.length; i++) {
        var key = QUALITY_ORDER[i];
        if (parts.indexOf(key) >= 0 && map[key]) return map[key];
      }
    }
  }
  var p = url.match(/[_\-\/](\d{3,4})p/);
  return p ? p[1] + 'p' : 'Unknown';
}

function resToQuality(w, h) {
  if (w >= 3840 || h >= 2160) return '4K';
  if (w >= 1920 || h >= 1080) return '1080p';
  if (w >= 1280 || h >= 720) return '720p';
  if (w >= 854 || h >= 480) return '480p';
  return '360p';
}

async function detectQuality(url, headers) {
  var q = detectQualityFromUrl(url);
  if (q !== 'Unknown') return q;
  try {
    var res = await fetch(url, {
      headers: Object.assign({ 'User-Agent': UA }, headers || {}),
      redirect: 'follow',
    });
    var text = await res.text();
    if (!text.includes('#EXT-X-STREAM-INF')) {
      var m = url.match(/[_-](\d{3,4})p/);
      return m ? m[1] + 'p' : 'Unknown';
    }
    var maxH = 0,
      maxW = 0;
    text.split('\n').forEach(function (line) {
      var r = line.match(/RESOLUTION=(\d+)x(\d+)/);
      if (r) {
        var h = parseInt(r[2], 10);
        if (h > maxH) {
          maxH = h;
          maxW = parseInt(r[1], 10);
        }
      }
    });
    return maxH > 0 ? resToQuality(maxW, maxH) : 'Unknown';
  } catch (e) {
    return 'Unknown';
  }
}

function b64decode(s) {
  try {
    if (typeof atob !== 'undefined') return atob(s);
    if (typeof Buffer !== 'undefined') return Buffer.from(s, 'base64').toString('utf8');
  } catch (e) {}
  return null;
}

// ─── PACKER (Dean Edwards / VidHide style) ───────────────
function unpackPacker(code) {
  try {
    var match = /eval\(function\(p,a,c,k,e,[a-z]\)\{[^}]+\}\s*\('([\s\S]+?)',\s*(\d+),\s*(\d+),\s*'([\s\S]+?)'\.split\('\|'\)/.exec(
      code
    );
    if (!match) return code;
    var p = match[1];
    var a = parseInt(match[2], 10);
    var c = parseInt(match[3], 10);
    var k = match[4].split('|');
    var chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    function unbase(str) {
      var result = 0;
      for (var i = 0; i < str.length; i++) {
        var pos = chars.indexOf(str[i]);
        if (pos === -1) return NaN;
        result = result * a + pos;
      }
      return result;
    }
    return p.replace(/\b([0-9a-zA-Z]+)\b/g, function (tok) {
      var idx = unbase(tok);
      if (isNaN(idx) || idx >= k.length) return tok;
      return k[idx] && k[idx] !== '' ? k[idx] : tok;
    });
  } catch (e) {
    return code;
  }
}

function unpackVidHide(script) {
  try {
    var match = /eval\(function\(p,a,c,k,e,[rd]\)\{.*?\}\s*\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/.exec(
      script
    );
    if (!match) return null;
    var p = match[1];
    var a = parseInt(match[2], 10);
    var k = match[4].split('|');
    var chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    function decode(l, s) {
      var res = '';
      var n = l;
      while (n > 0) {
        res = chars[n % s] + res;
        n = Math.floor(n / s);
      }
      return res || '0';
    }
    return p.replace(/\b\w+\b/g, function (tok) {
      var s = parseInt(tok, 36);
      if (!isNaN(s) && s < k.length && k[s]) return k[s];
      return decode(s, a);
    });
  } catch (e) {
    return null;
  }
}

function extractHlsFromUnpacked(unpacked, origin) {
  // Prefer hls4 > hls3 > hls2 en objeto JSON-like
  var objMatch = unpacked.match(/\{[^{}]*"hls[234]"\s*:\s*"([^"]+)"[^{}]*\}/);
  if (objMatch) {
    try {
      var fixed = objMatch[0].replace(/(\w+)\s*:/g, '"$1":');
      var parsed = JSON.parse(fixed);
      var a = parsed.hls4 || parsed.hls3 || parsed.hls2;
      if (a) return a.startsWith('/') ? origin + a : a;
    } catch (e) {
      var m = objMatch[0].match(/"hls[234]"\s*:\s*"([^"]+\.m3u8[^"]*)"/);
      if (m) return m[1].startsWith('/') ? origin + m[1] : m[1];
    }
  }
  var m2 = unpacked.match(/["']([^"']{30,}\.m3u8[^"']*)['"]/i);
  if (m2) {
    var u = m2[1];
    return u.startsWith('/') ? origin + u : u;
  }
  return null;
}

function findM3u8(text) {
  if (!text) return null;
  var m =
    /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i.exec(text) ||
    /(https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*)/i.exec(text) ||
    /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i.exec(text);
  if (!m) return null;
  return (m[1] || m[0]).replace(/\\/g, '');
}

// ─── VOE (del extractor de referencia) ───────────────────
function voeDecode(encoded, keysRaw) {
  try {
    var keys = keysRaw
      .replace(/^\[|\]$/g, '')
      .split("','")
      .map(function (o) {
        return o.replace(/^'+|'+$/g, '');
      })
      .map(function (o) {
        return o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      });
    var s = '';
    for (var i = 0; i < encoded.length; i++) {
      var u = encoded.charCodeAt(i);
      if (u > 64 && u < 91) u = ((u - 52) % 26) + 65;
      else if (u > 96 && u < 123) u = ((u - 84) % 26) + 97;
      s += String.fromCharCode(u);
    }
    for (var j = 0; j < keys.length; j++) {
      s = s.replace(new RegExp(keys[j], 'g'), '_');
    }
    s = s.split('_').join('');
    var r1 = b64decode(s);
    if (!r1) return null;
    var a = '';
    for (var k = 0; k < r1.length; k++) {
      a += String.fromCharCode((r1.charCodeAt(k) - 3 + 256) % 256);
    }
    var reversed = a.split('').reverse().join('');
    var r2 = b64decode(reversed);
    return r2 ? JSON.parse(r2) : null;
  } catch (e) {
    return null;
  }
}

async function resolveVoe(url) {
  try {
    var res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: url,
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    var html = await res.text();

    // permanentToken redirect
    if (/permanentToken/i.test(html)) {
      var redir = html.match(/window\.location\.href\s*=\s*'([^']+)'/i);
      if (redir) {
        var res2 = await fetch(redir[1], {
          headers: { 'User-Agent': UA, Referer: url },
          redirect: 'follow',
        });
        if (res2.ok) html = await res2.text();
      }
    }

    // JSON encoded + loader script
    var jsonMatch = html.match(
      /json">\s*\[\s*['"]([^'"]+)['"]\s*\]\s*<\/script>\s*<script[^>]*src=['"]([^'"]+)['"]/i
    );
    if (jsonMatch) {
      var enc = jsonMatch[1];
      var loaderUrl = jsonMatch[2].startsWith('http')
        ? jsonMatch[2]
        : new URL(jsonMatch[2], url).href;
      var loaderRes = await fetch(loaderUrl, {
        headers: { 'User-Agent': UA, Referer: url },
        redirect: 'follow',
      });
      var loaderText = loaderRes.ok ? await loaderRes.text() : '';
      var keysMatch =
        loaderText.match(/(\[(?:'[^']{1,10}'[\s,]*){4,12}\])/i) ||
        loaderText.match(/(\[(?:"[^"]{1,10}"[,\s]*){4,12}\])/i);
      if (keysMatch) {
        var decoded = voeDecode(enc, keysMatch[1]);
        if (decoded && (decoded.source || decoded.direct_access_url)) {
          var streamUrl = decoded.source || decoded.direct_access_url;
          return {
            url: streamUrl,
            quality: detectQualityFromUrl(streamUrl),
            headers: { Referer: url, 'User-Agent': UA },
          };
        }
      }
    }

    // Fallback: mp4|hls : '...'
    var patterns = [
      /(?:mp4|hls)'\s*:\s*'([^']+)'/gi,
      /(?:mp4|hls)"\s*:\s*"([^"]+)"/gi,
    ];
    for (var pi = 0; pi < patterns.length; pi++) {
      var re = patterns[pi];
      var m;
      while ((m = re.exec(html)) !== null) {
        var u = m[1];
        if (!u) continue;
        if (u.indexOf('aHR0') === 0) {
          try {
            u = b64decode(u) || u;
          } catch (e) {}
        }
        return {
          url: u,
          quality: detectQualityFromUrl(u),
          headers: { Referer: url, 'User-Agent': UA },
        };
      }
    }

    var m3u8 = findM3u8(html);
    if (m3u8) {
      return {
        url: m3u8,
        quality: detectQualityFromUrl(m3u8),
        headers: { Referer: url, 'User-Agent': UA },
      };
    }
  } catch (e) {}
  return null;
}

// ─── STREAMWISH / HLSWISH (del extractor de referencia) ──
async function resolveStreamWish(url) {
  try {
    var n = mapDomain(url);
    var originMatch = n.match(/^(https?:\/\/[^/]+)/);
    var origin = (originMatch && originMatch[1]) || 'https://hlswish.com';

    var res = await fetch(n, {
      headers: {
        'User-Agent': UA,
        Referer: 'https://embed69.org/',
        Origin: 'https://embed69.org',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    var html = await res.text();

    // 1) file: "..."
    var fileM = html.match(/file\s*:\s*["']([^"']+)["']/i);
    if (fileM) {
      var o = fileM[1];
      if (o.startsWith('/')) o = origin + o;
      // Si apunta a /stream/ seguir redirect hasta m3u8
      if (o.indexOf('/stream/') >= 0) {
        try {
          var follow = await fetch(o, {
            headers: { 'User-Agent': UA, Referer: origin + '/' },
            redirect: 'follow',
          });
          if (follow.url && follow.url.indexOf('.m3u8') >= 0) o = follow.url;
        } catch (e) {}
      }
      if (o.indexOf('.m3u8') >= 0 || o.indexOf('.mp4') >= 0 || o.indexOf('/stream/') >= 0) {
        return {
          url: o,
          quality: detectQualityFromUrl(o),
          headers: { 'User-Agent': UA, Referer: origin + '/' },
        };
      }
    }

    // 2) Packer
    var packed = html.match(
      /eval\(function\(p,a,c,k,e,[a-z]\)\{[^}]+\}\s*\('([\s\S]+?)',\s*(\d+),\s*(\d+),\s*'([\s\S]+?)'\.split\('\|'\)/
    );
    if (packed) {
      var unpacked = unpackPacker(packed[0]);
      var hls = extractHlsFromUnpacked(unpacked, origin);
      if (hls) {
        return {
          url: hls,
          quality: detectQualityFromUrl(hls),
          headers: { 'User-Agent': UA, Referer: origin + '/' },
        };
      }
    }

    // 3) Regex directo m3u8
    var direct = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
    if (direct) {
      return {
        url: direct[0],
        quality: detectQualityFromUrl(direct[0]),
        headers: { 'User-Agent': UA, Referer: origin + '/' },
      };
    }
  } catch (e) {}
  return null;
}

// ─── VIDHIDE (del extractor de referencia) ───────────────
async function resolveVidHide(url) {
  try {
    var res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: 'https://embed69.org/',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    var html = await res.text();

    var packedMatch = html.match(
      /eval\(function\(p,a,c,k,e,[rd]\)[\s\S]*?\.split\('\|'\)[^\)]*\)\)/
    );
    if (!packedMatch) return null;

    var unpacked = unpackVidHide(packedMatch[0]);
    if (!unpacked) return null;

    var hls4 = unpacked.match(/"hls4"\s*:\s*"([^"]+)"/);
    var hls2 = unpacked.match(/"hls2"\s*:\s*"([^"]+)"/);
    var path = (hls4 && hls4[1]) || (hls2 && hls2[1]);
    if (!path) return null;

    var finalUrl = path.startsWith('http') ? path : new URL(url).origin + path;
    var origin = new URL(url).origin;

    return {
      url: finalUrl,
      quality: await detectQuality(finalUrl, { Referer: origin + '/' }),
      headers: {
        'User-Agent': UA,
        Referer: origin + '/',
        Origin: origin,
      },
    };
  } catch (e) {
    return null;
  }
}

// ─── GENÉRICO (player intermedio Cuevana + fallback) ─────
async function resolveGeneric(url) {
  try {
    var html = await httpGet(url, { Referer: BASE + '/' });
    if (!html) return null;

    // var url = '...' (player.php estilo Cuevana)
    var m1 =
      /var url = '([^']+)'/.exec(html) || /var url = "([^"]+)"/.exec(html);
    if (m1) {
      var redirected = mapDomain(m1[1]);
      if (redirected && redirected !== url) {
        return extract(redirected);
      }
    }

    var unpacked = unpackPacker(html);
    var streamUrl =
      findM3u8(unpacked) ||
      findM3u8(html) ||
      extractHlsFromUnpacked(unpacked, new URL(url).origin);

    if (!streamUrl) {
      var fileM = /file\s*:\s*["']([^"']+)["']/i.exec(unpacked || html);
      if (fileM && /\.m3u8|\.mp4/i.test(fileM[1])) {
        streamUrl = fileM[1].replace(/\\/g, '');
      }
    }
    if (!streamUrl) return null;
    if (streamUrl.startsWith('/')) streamUrl = new URL(url).origin + streamUrl;

    var origin = '';
    try {
      origin = new URL(url).origin;
    } catch (e) {}

    return {
      url: streamUrl,
      quality: detectQualityFromUrl(streamUrl),
      headers: { 'User-Agent': UA, Referer: url, Origin: origin },
    };
  } catch (e) {
    return null;
  }
}

// ─── EXTRACT PRINCIPAL ───────────────────────────────────
async function extract(embedUrl) {
  if (!embedUrl) return null;
  embedUrl = mapDomain(String(embedUrl).trim());

  var server = detectServer(embedUrl);
  var result = null;

  try {
    if (server === 'voe') result = await resolveVoe(embedUrl);
    else if (server === 'streamwish') result = await resolveStreamWish(embedUrl);
    else if (server === 'vidhide') result = await resolveVidHide(embedUrl);
    else result = await resolveGeneric(embedUrl);
  } catch (e) {
    result = null;
  }

  // Fallback genérico si el específico falló
  if (!result || !result.url) {
    try {
      result = await resolveGeneric(embedUrl);
    } catch (e) {}
  }

  if (result && result.url) {
    var u = result.url.toLowerCase();
    if (
      u.indexOf('.m3u8') >= 0 ||
      u.indexOf('.mp4') >= 0 ||
      u.indexOf('/hls/') >= 0 ||
      u.indexOf('/stream/') >= 0 ||
      u.indexOf('playlist') >= 0
    ) {
      return result;
    }
  }
  return null;
}

// ─── TMDB & CUEVANA SCRAPING ─────────────────────────────
async function getTmdbInfo(tmdbId, isMovie) {
  var endpoint = isMovie ? 'movie' : 'tv';
  async function fetchLang(lang) {
    try {
      return await httpGetJson(
        TMDB + '/' + endpoint + '/' + tmdbId + '?api_key=' + TMDB_KEY + '&language=' + lang
      );
    } catch (e) {
      return null;
    }
  }
  var es = await fetchLang('es-MX');
  var eses = await fetchLang('es-ES');
  var en = await fetchLang('en-US');
  var dateStr = isMovie
    ? (es && es.release_date) || (en && en.release_date)
    : (es && es.first_air_date) || (en && en.first_air_date);
  var year = null;
  if (dateStr && String(dateStr).length >= 4)
    year = parseInt(String(dateStr).slice(0, 4), 10);
  return {
    id: tmdbId,
    latino: (es && (es.title || es.name)) || '',
    castellano: (eses && (eses.title || eses.name)) || '',
    ingles: (en && (en.title || en.name)) || '',
    year: year,
  };
}

function extractNextData(html) {
  var m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try {
    var data = JSON.parse(m[1]);
    return data.props && data.props.pageProps ? data.props.pageProps : null;
  } catch (e) {
    return null;
  }
}

function videoGroupsFromData(videos) {
  var langMap = {
    latino: 'Español Latino',
    spanish: 'Español Castellano',
    english: 'Inglés',
    japanese: 'Japonés',
  };
  var groups = [];
  Object.keys(langMap).forEach(function (key) {
    var list = videos[key];
    if (!list || !list.length) return;
    var vids = [];
    list.forEach(function (v) {
      var cyber = (v.cyberlocker || '').toString();
      var url = (v.result || '').toString();
      var quality = (v.quality || 'HD').toString();
      if (!url) return;
      vids.push({ cyberlocker: cyber, url: url, quality: quality });
    });
    if (vids.length) groups.push({ language: langMap[key], videos: vids });
  });
  return groups;
}

async function scrapeMovie(tmdb) {
  var prefix = BASE + '/ver-pelicula/';
  var titles = [tmdb.latino, tmdb.castellano, tmdb.ingles];
  var candidates = [];
  titles.forEach(function (title) {
    if (!title || !String(title).trim()) return;
    var slug = slugify(title);
    if (!slug) return;
    candidates.push(prefix + slug);
    candidates.push(prefix + slug + '-' + tmdb.id);
    if (tmdb.year) candidates.push(prefix + slug + '-' + tmdb.year);
  });
  candidates = candidates.filter(function (v, i, a) {
    return a.indexOf(v) === i;
  });

  for (var i = 0; i < candidates.length; i++) {
    var html = await httpGet(candidates[i], {
      Accept: 'text/html',
      'Accept-Language': 'es-ES,es;q=0.9',
    });
    if (
      html &&
      html.indexOf('__NEXT_DATA__') >= 0 &&
      html.indexOf('"thisMovie"') >= 0
    ) {
      var pageProps = extractNextData(html);
      if (pageProps && pageProps.thisMovie && pageProps.thisMovie.videos) {
        return videoGroupsFromData(pageProps.thisMovie.videos);
      }
    }
  }
  return [];
}

async function scrapeEpisode(tmdb, season, episode) {
  var nombres = [];
  if (tmdb.latino && tmdb.latino.trim()) nombres.push(tmdb.latino);
  if (tmdb.castellano && tmdb.castellano.trim()) nombres.push(tmdb.castellano);
  if (tmdb.ingles && tmdb.ingles.trim()) nombres.push(tmdb.ingles);

  var candidates = [];
  nombres.forEach(function (nombre) {
    var slug = slugify(nombre);
    if (!slug) return;
    candidates.push(
      BASE +
        '/episodio/' +
        slug +
        '-temporada-' +
        season +
        '-episodio-' +
        episode
    );
    candidates.push(
      BASE +
        '/episodio/' +
        slug +
        '-' +
        tmdb.id +
        '-temporada-' +
        season +
        '-episodio-' +
        episode
    );
  });

  for (var i = 0; i < candidates.length; i++) {
    var html = await httpGet(candidates[i], {
      Accept: 'text/html',
      'Accept-Language': 'es-ES,es;q=0.9',
    });
    if (
      html &&
      html.indexOf('__NEXT_DATA__') >= 0 &&
      html.indexOf('"episode"') >= 0
    ) {
      var pageProps = extractNextData(html);
      if (pageProps && pageProps.episode && pageProps.episode.videos) {
        return videoGroupsFromData(pageProps.episode.videos);
      }
    }
  }
  return [];
}

// ─── MAIN ────────────────────────────────────────────────
async function getStreams(tmdbId, type, season, episode) {
  var id = parseInt(tmdbId, 10);
  if (!id) return [];

  var isMovie =
    String(type).toLowerCase().indexOf('tv') < 0 &&
    String(type).toLowerCase().indexOf('series') < 0;

  var tmdb = await getTmdbInfo(id, isMovie);
  if (!tmdb.latino && !tmdb.ingles && !tmdb.castellano) return [];

  var groups = isMovie
    ? await scrapeMovie(tmdb)
    : await scrapeEpisode(tmdb, season || 1, episode || 1);

  var out = [];
  var seen = {};

  for (var g = 0; g < groups.length; g++) {
    var group = groups[g];
    for (var v = 0; v < group.videos.length; v++) {
      var video = group.videos[v];
      if (!isAllowed(video.cyberlocker)) continue;

      var embedUrl = mapDomain(video.url);
      if (!embedUrl) continue;

      var extracted = await extract(embedUrl);

      // Solo HLS/MP4 reales — NUNCA el embed puro
      if (!extracted || !extracted.url) continue;

      var directUrl = extracted.url;
      if (seen[directUrl]) continue;
      seen[directUrl] = true;

      var name = video.cyberlocker
        ? video.cyberlocker.charAt(0).toUpperCase() + video.cyberlocker.slice(1)
        : 'Servidor';

      out.push({
        url: directUrl,
        title: 'Cuevana · ' + name,
        quality: extracted.quality || video.quality || 'HD',
        language: langCode(group.language),
        headers: extracted.headers || {
          'User-Agent': UA,
          Referer: embedUrl,
        },
      });
    }
  }
  return out;
}

module.exports = {
  getStreams: getStreams,
  extract: extract,
};
