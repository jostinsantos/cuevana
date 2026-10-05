/**
 * Fuente Cuevana — Extracción directa HLS (.m3u8) / MP4
 * getStreams + extract con resolvers (VOE, StreamWish, VidHide)
 * FIX idiomas: title + language/lang/audio/Audio legibles para la app
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
    var res = await fetchT(url, { headers: h, redirect: 'follow' });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    return null;
  }
}
async function httpGetJson(url) {
  try {
    var res = await fetchT(url, {
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
/**
 * Normaliza el idioma a etiqueta legible que la app puede filtrar/mostrar.
 * Antes devolvía códigos (es_MX / es_ES / en_US) y "sub" se mapeaba a en_US → todo se veía mal.
 */
function normalizeLanguage(language) {
  var lang = String(language || '').toLowerCase().trim();
  if (!lang) return 'Latino';
  if (
    lang.indexOf('castellano') >= 0 ||
    lang.indexOf('españa') >= 0 ||
    lang.indexOf('es_es') >= 0 ||
    lang === 'spanish' ||
    lang === 'esp'
  ) {
    return 'Castellano';
  }
  if (
    lang.indexOf('sub') >= 0 ||
    lang.indexOf('vose') >= 0 ||
    lang.indexOf('subtit') >= 0
  ) {
    return 'Subtitulado';
  }
  if (
    lang.indexOf('ingl') >= 0 ||
    lang.indexOf('english') >= 0 ||
    lang.indexOf('en_us') >= 0 ||
    lang === 'en'
  ) {
    return 'Inglés';
  }
  if (lang.indexOf('japon') >= 0 || lang.indexOf('ja_') >= 0) {
    return 'Japonés';
  }
  // latino / es_mx / español latino / default
  return 'Latino';
}
/** Código corto opcional (por si alguna UI lo usa) */
function langCode(language) {
  var n = normalizeLanguage(language);
  if (n === 'Castellano') return 'es_ES';
  if (n === 'Inglés') return 'en_US';
  if (n === 'Japonés') return 'ja_JA';
  if (n === 'Subtitulado') return 'sub';
  return 'es_MX';
}
function isAllowed(name) {
  var n = String(name || '').toLowerCase();
  for (var i = 0; i < ALLOWED.length; i++) {
    if (n.indexOf(ALLOWED[i]) >= 0) return true;
  }
  return false;
}
// ─── DEBUG / RED / URL (sin depender de new URL: en Hermes/React Native no funciona) ──
var DEBUG = false; // pon true para ver en consola por qué falla cada embed
function dbg() {
  if (!DEBUG || typeof console === 'undefined') return;
  try {
    console.log.apply(console, ['[Cuevana]'].concat([].slice.call(arguments)));
  } catch (e) {}
}
// fetch con timeout (evita que un host muerto congele todo getStreams)
function fetchT(url, opts, ms) {
  opts = opts || {};
  ms = ms || 8000;
  if (typeof AbortController === 'undefined') return fetch(url, opts);
  var ctrl = new AbortController();
  var timer = setTimeout(function () {
    try {
      ctrl.abort();
    } catch (e) {}
  }, ms);
  return fetch(url, Object.assign({}, opts, { signal: ctrl.signal })).then(
    function (r) {
      clearTimeout(timer);
      return r;
    },
    function (e) {
      clearTimeout(timer);
      throw e;
    }
  );
}
function originOf(url) {
  var m = /^(https?:\/\/[^\/?#]+)/i.exec(String(url || ''));
  return m ? m[1] : '';
}
function absUrl(u, base) {
  u = String(u || '').trim();
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  var origin = originOf(base);
  if (u.charAt(0) === '/') return origin + u;
  var rest = String(base || '').slice(origin.length).replace(/[?#][\s\S]*$/, '');
  if (!rest) return origin + '/' + u;
  return origin + rest.replace(/\/[^\/]*$/, '/') + u;
}
function withHost(url, host) {
  return String(url).replace(/^(https?:\/\/)[^\/?#]+/i, '$1' + host);
}
// ─── MAPEO DE HOSTS QUE ROTAN ────────────────────────────
var HOST_MAP = {
  streamwish: 'vibuxer.com',
  hglink: 'vibuxer.com',
  awish: 'vibuxer.com',
  strwish: 'vibuxer.com',
  wishfast: 'vibuxer.com',
  embedwish: 'vibuxer.com',
  wishembed: 'vibuxer.com',
  filelions: 'callistanise.com',
  vidhidepro: 'callistanise.com',
  vidhide: 'callistanise.com',
};
function mapDomain(url) {
  var s = String(url || '').trim();
  if (!s) return s;
  if (s.indexOf('//') === 0) s = 'https:' + s;
  var m = /^https?:\/\/([^\/?#:]+)/i.exec(s);
  if (!m) return s;
  var labels = m[1].toLowerCase().replace(/^www\./, '').split('.');
  for (var i = 0; i < labels.length - 1; i++) {
    if (HOST_MAP[labels[i]]) return withHost(s, HOST_MAP[labels[i]]);
  }
  return s;
}
function embedCandidates(url) {
  var s = String(url || '').trim();
  if (s.indexOf('//') === 0) s = 'https:' + s;
  var mapped = mapDomain(s);
  var list = [mapped, s];
  if (detectServer(mapped) === 'streamwish') list.push(withHost(s, 'hlswish.com'));
  return list.filter(function (v, i, a) {
    return v && a.indexOf(v) === i;
  });
}
function hostOf(url) {
  var m = /^(?:https?:)?\/\/([^\/?#]+)/i.exec(String(url || ''));
  return m ? m[1].toLowerCase() : String(url || '').toLowerCase();
}
function detectServer(url) {
  var s = hostOf(url);
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
    s.indexOf('vibuxer') >= 0 ||
    s.indexOf('premilkyway') >= 0 ||
    s.indexOf('wishembed') >= 0 ||
    s.indexOf('awish') >= 0 ||
    s.indexOf('strwish') >= 0 ||
    s.indexOf('wishfast') >= 0 ||
    s.indexOf('hanerix') >= 0 ||
    s.indexOf('embedwish') >= 0 ||
    s.indexOf('playnixes') >= 0 ||
    s.indexOf('hgplaycdn') >= 0
  )
    return 'streamwish';
  if (
    s.indexOf('vidhide') >= 0 ||
    s.indexOf('filelions') >= 0 ||
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
// ─── QUALITY HELPERS ─────────────────────────────────────
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
    var res = await fetchT(url, {
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
// ─── PACKER (Dean Edwards) ───────────────────────────────
var PACKER_ARGS =
  /\}\s*\(\s*(['"])((?:\\[\s\S]|(?!\1)[^\\])*)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])((?:\\[\s\S]|(?!\5)[^\\])*)\5\s*\.split\(\s*(['"])\|\7\s*\)/g;
function unpackOne(p, a, k) {
  p = p.replace(/\\(['"\\])/g, '$1');
  var chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function unbase(s) {
    var r = 0;
    for (var i = 0; i < s.length; i++) {
      var pos = chars.indexOf(s.charAt(i));
      if (pos < 0 || pos >= a) return NaN;
      r = r * a + pos;
    }
    return r;
  }
  return p.replace(/\b\w+\b/g, function (tok) {
    var idx = unbase(tok);
    if (isNaN(idx) || idx >= k.length) return tok;
    return k[idx] ? k[idx] : tok;
  });
}
function unpackAll(text) {
  var out = [];
  var queue = [String(text || '')];
  var guard = 0;
  while (queue.length && guard++ < 8) {
    var src = queue.shift();
    var re = new RegExp(PACKER_ARGS.source, 'g');
    var m;
    while ((m = re.exec(src)) !== null) {
      try {
        var un = unpackOne(m[2], parseInt(m[3], 10), m[6].split('|'));
        out.push(un);
        if (/eval\(function\(p,a,c,k,e,/.test(un)) queue.push(un);
      } catch (e) {}
    }
  }
  return out;
}
function unpackPacker(code) {
  var all = unpackAll(code);
  return all.length ? all.join('\n') : code;
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
function extractHlsFromUnpacked(text, origin) {
  if (!text) return null;
  var found = {};
  var re = /["']?\b(hls[234]?)["']?\s*:\s*["']([^"']+)["']/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    var v = m[2].replace(/\\/g, '');
    if (/^(https?:)?\/\//i.test(v) || v.charAt(0) === '/') {
      if (!found[m[1]]) found[m[1]] = v;
    }
  }
  var pick = found.hls4 || found.hls3 || found.hls2 || found.hls;
  if (pick) return absUrl(pick, origin + '/');
  var abs = findM3u8(text);
  if (abs) return abs;
  var rel = /["'](\/[^"'\s]+\.m3u8[^"']*)["']/i.exec(text);
  if (rel) return absUrl(rel[1].replace(/\\/g, ''), origin + '/');
  var f = /file\s*:\s*["']([^"']+\.mp4[^"']*)["']/i.exec(text);
  if (f) return absUrl(f[1].replace(/\\/g, ''), origin + '/');
  return null;
}
function findStream(html, origin) {
  if (!html) return null;
  var layers = unpackAll(html).concat([html]);
  for (var i = 0; i < layers.length; i++) {
    var s = extractHlsFromUnpacked(layers[i], origin);
    if (s) return s;
  }
  return null;
}
async function followStream(u, origin) {
  if (u.indexOf('.m3u8') >= 0 || u.indexOf('.mp4') >= 0) return u;
  if (u.indexOf('/stream/') < 0) return u;
  try {
    var f = await fetchT(u, { headers: { 'User-Agent': UA, Referer: origin + '/' }, redirect: 'follow' });
    if (f && f.url && f.url.indexOf('.m3u8') >= 0) return f.url;
  } catch (e) {}
  return u;
}
// ─── VOE ─────────────────────────────────────────────────
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
    var res = await fetchT(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: url,
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    var html = await res.text();
    if (/permanentToken/i.test(html)) {
      var redir = html.match(/window\.location\.href\s*=\s*'([^']+)'/i);
      if (redir) {
        var res2 = await fetchT(redir[1], {
          headers: { 'User-Agent': UA, Referer: url },
          redirect: 'follow',
        });
        if (res2.ok) html = await res2.text();
      }
    }
    var jsonMatch = html.match(
      /json">\s*\[\s*['"]([^'"]+)['"]\s*\]\s*<\/script>\s*<script[^>]*src=['"]([^'"]+)['"]/i
    );
    if (jsonMatch) {
      var enc = jsonMatch[1];
      var loaderUrl = jsonMatch[2].startsWith('http')
        ? jsonMatch[2]
        : absUrl(jsonMatch[2], url);
      var loaderRes = await fetchT(loaderUrl, {
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
// ─── STREAMWISH / VIDHIDE ────────────────────────────────
async function resolvePacked(url) {
  var origin = originOf(url);
  var html = null;
  var referers = ['https://embed69.org/', BASE + '/'];
  for (var i = 0; i < referers.length && !html; i++) {
    html = await httpGet(url, { Referer: referers[i], Origin: originOf(referers[i]) });
  }
  if (!html) {
    dbg('sin HTML', url);
    return null;
  }
  var s = findStream(html, origin);
  if (!s) {
    dbg('HTML sin stream', url, html.length);
    return null;
  }
  s = await followStream(s, origin);
  return {
    url: s,
    quality: await detectQuality(s, { Referer: origin + '/' }),
    headers: { 'User-Agent': UA, Referer: origin + '/', Origin: origin },
  };
}
function resolveStreamWish(url) {
  return resolvePacked(url);
}
function resolveVidHide(url) {
  return resolvePacked(url);
}
// ─── GENÉRICO ────────────────────────────────────────────
async function resolveGeneric(url, depth) {
  depth = depth || 0;
  try {
    var html = await httpGet(url, { Referer: BASE + '/' });
    if (!html) return null;
    var origin = originOf(url);
    var m1 = /var url = '([^']+)'/.exec(html) || /var url = "([^"]+)"/.exec(html);
    if (m1) {
      var redirected = absUrl(m1[1], url);
      if (redirected && redirected !== url) {
        var r1 = await extract(redirected, depth + 1);
        if (r1) return r1;
      }
    }
    var streamUrl = findStream(html, origin);
    if (streamUrl) {
      return {
        url: streamUrl,
        quality: detectQualityFromUrl(streamUrl),
        headers: { 'User-Agent': UA, Referer: url, Origin: origin },
      };
    }
    var ifr = /<iframe[^>]+src=["']([^"']+)["']/i.exec(html);
    if (ifr) {
      var ifUrl = absUrl(ifr[1], url);
      if (ifUrl && ifUrl !== url) return await extract(ifUrl, depth + 1);
    }
  } catch (e) {
    dbg('generic error', url, e && e.message);
  }
  return null;
}
// ─── EXTRACT PRINCIPAL ───────────────────────────────────
function isStreamUrl(u) {
  u = String(u || '').toLowerCase();
  return (
    u.indexOf('.m3u8') >= 0 ||
    u.indexOf('.mp4') >= 0 ||
    u.indexOf('/hls/') >= 0 ||
    u.indexOf('/stream/') >= 0 ||
    u.indexOf('playlist') >= 0
  );
}
async function extractOne(url, depth) {
  var server = detectServer(url);
  var result = null;
  try {
    if (server === 'voe') result = await resolveVoe(url);
    else if (server === 'streamwish') result = await resolveStreamWish(url);
    else if (server === 'vidhide') result = await resolveVidHide(url);
    else result = await resolveGeneric(url, depth);
  } catch (e) {
    dbg('resolver error', server, url, e && e.message);
    result = null;
  }
  if ((!result || !result.url) && server !== 'unknown') {
    try {
      result = await resolveGeneric(url, depth);
    } catch (e) {}
  }
  return result;
}
async function extract(embedUrl, depth) {
  depth = depth || 0;
  if (!embedUrl || depth > 3) return null;
  var candidates = embedCandidates(embedUrl);
  dbg('candidatos', candidates);
  for (var i = 0; i < candidates.length; i++) {
    var r = await extractOne(candidates[i], depth);
    if (r && r.url && r.url !== candidates[i] && isStreamUrl(r.url)) {
      dbg('OK', candidates[i], '→', r.url);
      return r;
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
  // Etiquetas legibles desde el primer momento (no códigos)
  var langMap = {
    latino: 'Latino',
    spanish: 'Castellano',
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
async function processVideo(group, video) {
  try {
    var embedUrl = String(video.url || '').trim();
    if (!embedUrl) return null;
    var extracted = await extract(embedUrl, 0);
    if (!extracted || !extracted.url) {
      dbg('descartado (sin m3u8)', embedUrl);
      return null;
    }
    var serverName = video.cyberlocker
      ? video.cyberlocker.charAt(0).toUpperCase() + video.cyberlocker.slice(1)
      : 'Servidor';
    var q = extracted.quality;
    if (!q || q === 'Unknown') q = video.quality || 'HD';

    // Idioma legible + código (por compatibilidad)
    var langLabel = normalizeLanguage(group.language);
    var code = langCode(langLabel);

    return {
      name: 'Cuevana - ' + q,
      // title con idioma primero → la app/página lo puede parsear
      title: langLabel + ' - ' + serverName,
      url: extracted.url,
      quality: q,
      // Campos de idioma explícitos (misma convención que embed69 fixed)
      language: langLabel,
      lang: langLabel,
      audio: langLabel,
      Audio: langLabel,
      langCode: code,
      provider: serverName,
      headers: extracted.headers || {
        'User-Agent': UA,
        Referer: originOf(embedUrl) + '/',
      },
    };
  } catch (e) {
    dbg('processVideo error', e && e.message);
    return null;
  }
}
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
  var jobs = [];
  groups.forEach(function (group) {
    group.videos.forEach(function (video) {
      if (!isAllowed(video.cyberlocker) && !isAllowed(hostOf(video.url))) return;
      jobs.push(processVideo(group, video));
    });
  });
  var results = await Promise.all(jobs);
  var out = [];
  var seen = {};
  results.forEach(function (r) {
    if (!r || seen[r.url]) return;
    seen[r.url] = true;
    out.push(r);
  });
  return out;
}
module.exports = {
  getStreams: getStreams,
  extract: extract,
  mapDomain: mapDomain,
  normalizeLanguage: normalizeLanguage,
};
