/**
 * Fuente Cuevana — Extracción directa HLS (.m3u8) / MP4
 * getStreams(tmdbId, type, season, episode) → lista de streams directos
 * extract(embedUrl) → { url, quality, headers, serverName } | null
 *
 * Basado en los resolvers nativos de Dart (StreamWish, VidHide, VOE, etc.)
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
  'playnixes', 'hgplaycdn', 'minochinos', 'vadisov', 'vaiditv'
];

// Dominios que cambian con frecuencia (mapeo de player.php / mirrors)
var DOMAIN_MAP = {
  'streamwish.to': 'playnixes.com',
  'vidhidepro.com': 'callistanise.com',
  'filelions.to': 'callistanise.com',
  'filelions.com': 'callistanise.com',
  'streamwish.com': 'playnixes.com',
  'vidhide.com': 'callistanise.com'
};

// Mirrors conocidos para detección de servidor
var STREAMWISH_MIRRORS = [
  'hlswish', 'streamwish', 'hglink', 'hglamioz', 'hglink.to',
  'audinifer', 'embedwish', 'awish', 'dwish', 'strwish',
  'filelions', 'wishembed', 'wishfast', 'hanerix', 'playnixes',
  'hgplaycdn'
];
var VIDHIDE_MIRRORS = [
  'vidhide', 'minochinos', 'vadisov', 'vaiditv', 'amusemre',
  'callistanise', 'vhaudm', 'mdfury', 'dintezuvio', 'acek-cdn',
  'vedonm', 'vidhidepro', 'vidhidevip', 'masukestin', 'vidoza',
  'supervideo'
];
var VOE_MIRRORS = [
  'voe.sx', 'voe-sx', 'voex.sx', 'marissashare', 'cloudwindow',
  'marissasharecareer'
];
var DOOD_MIRRORS = [
  'dood.li', 'dood.la', 'ds2video.com', 'ds2play.com', 'dood.yt',
  'dood.ws', 'dood.so', 'dood.to', 'dood.pm', 'dood.watch',
  'dood.sh', 'dood.cx', 'dood.wf', 'dood.re', 'dood.one',
  'dood.tech', 'dood.work', 'doods.pro', 'dooood.com',
  'doodstream.com', 'doodstream.co', 'd000d.com', 'd0000d.com',
  'do0od.com', 'dooodster.com', 'vidply.com', 'do7go.com'
];

// ─── HELPERS ─────────────────────────────────────────────
async function httpGet(url, headers) {
  try {
    var h = Object.assign(
      { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'es-ES,es;q=0.9' },
      headers || {}
    );
    var res = await fetch(url, { headers: h });
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
  if (VOE_MIRRORS.some(function (m) { return s.indexOf(m) >= 0; })) return 'voe';
  if (STREAMWISH_MIRRORS.some(function (m) { return s.indexOf(m) >= 0; }) || s.indexOf('filelions') >= 0)
    return 'streamwish';
  if (VIDHIDE_MIRRORS.some(function (m) { return s.indexOf(m) >= 0; })) return 'vidhide';
  if (DOOD_MIRRORS.some(function (m) { return s.indexOf(m) >= 0; })) return 'doodstream';
  if (s.indexOf('ok.ru') >= 0 || s.indexOf('okru') >= 0) return 'okru';
  if (s.indexOf('filemoon') >= 0 || s.indexOf('moonalu') >= 0) return 'filemoon';
  return 'unknown';
}

/** Dean Edwards packer (StreamWish, Lulu, etc.) */
function unpackPacker(code) {
  try {
    if (!/eval\(function\(p,a,c,k,e,[rd]\)/.test(code)) return code;
    var match = /}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/.exec(code);
    if (!match) return code;
    var p = match[1];
    var a = parseInt(match[2], 10);
    var c = parseInt(match[3], 10);
    var k = match[4].split('|');
    function e(c) {
      return (c < a ? '' : e(parseInt(c / a, 10))) +
        ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
    }
    while (c--) {
      if (k[c]) p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
    }
    return p;
  } catch (err) {
    return code;
  }
}

/** Unpacker específico estilo VidHide (radix 36) */
function unpackVidHide(script) {
  try {
    var match = /eval\(function\(p,a,c,k,e,[rd]\)\{[\s\S]*?\}\s*\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/.exec(script);
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
      if (!isNaN(s) && s >= 0 && s < k.length && k[s]) return k[s];
      return decode(s, a);
    });
  } catch (e) {
    return null;
  }
}

function findM3u8(text) {
  if (!text) return null;
  var m =
    /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i.exec(text) ||
    /(https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*)/i.exec(text) ||
    /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i.exec(text) ||
    /["'](https?:\/\/[^"']+\/stream\/[^"']+\.m3u8[^"']*)["']/i.exec(text);
  if (!m) return null;
  return (m[1] || m[0]).replace(/\\/g, '');
}

function absUrl(base, path) {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  try {
    return new URL(path, base).toString();
  } catch (e) {
    return path;
  }
}

// ─── RESOLVERS ESPECÍFICOS (port de Dart) ─────────────────

async function resolveStreamWish(url) {
  var rawId = url.split('/').pop().replace(/\.html$/i, '');
  var mirrors = [
    'https://hanerix.com/e/' + rawId,
    'https://embedwish.com/e/' + rawId,
    'https://hglink.to/e/' + rawId,
    url,
    'https://streamwish.to/e/' + rawId,
    'https://awish.pro/e/' + rawId,
    'https://strwish.com/e/' + rawId,
    'https://wishfast.top/e/' + rawId,
    'https://playnixes.com/e/' + rawId,
  ];

  for (var i = 0; i < mirrors.length; i++) {
    var mirror = mirrors[i];
    try {
      var origin = new URL(mirror).origin;
      var resp = await httpGet(mirror, { Referer: mirror });
      if (!resp) continue;

      var m3u8Url = null;

      // 1) Hash + endpoint /dl (método principal actual)
      var hashMatch = /[0-9a-f]{32}/i.exec(resp);
      if (hashMatch) {
        var hash = hashMatch[0];
        var dlUrl =
          origin +
          '/dl?op=view&file_code=' +
          rawId +
          '&hash=' +
          hash +
          '&embed=1&referer=&adb=1&hls4=1';
        var dlBody = await httpGet(dlUrl, {
          Referer: mirror,
          'X-Requested-With': 'XMLHttpRequest',
        });
        if (dlBody) {
          m3u8Url = findM3u8(dlBody);
        }
      }

      // 2) Packer
      if (!m3u8Url) {
        var unpacked = unpackPacker(resp);
        m3u8Url = findM3u8(unpacked);
      }

      // 3) file: "..."
      if (!m3u8Url) {
        var fileM = /file\s*:\s*["']([^"']+)["']/i.exec(resp);
        if (fileM) m3u8Url = fileM[1].replace(/\\/g, '');
      }

      if (m3u8Url) {
        m3u8Url = absUrl(origin, m3u8Url);
        return {
          url: m3u8Url,
          quality: 'Auto',
          serverName: 'StreamWish',
          headers: {
            'User-Agent': UA,
            Referer: mirror,
            Origin: origin,
          },
        };
      }
    } catch (e) {}
  }
  return null;
}

async function resolveVidHide(url) {
  try {
    var domain = new URL(url).host;
    var html = await httpGet(url, { Referer: 'https://' + domain + '/' });
    if (!html) return null;

    var finalUrl = null;
    var quality = '1080p';

    // Packer VidHide
    var packedMatch = /eval\(function\(p,a,c,k,e,[rd]\)[\s\S]*?\.split\('\|'\)[^\)]*\)\)/.exec(html);
    if (packedMatch) {
      var unpacked = unpackVidHide(packedMatch[0]);
      if (unpacked) {
        var hls = /"hls[24]"\s*:\s*"([^"]+)"/.exec(unpacked);
        if (hls) finalUrl = hls[1];
        var label =
          /\{label\s*:\s*"([^"]+)"/i.exec(unpacked) ||
          /name\s*:\s*"([^"]+)"/i.exec(unpacked);
        if (label) {
          quality = /p/i.test(label[1]) ? label[1] : label[1] + 'p';
        }
      }
    }

    if (!finalUrl) {
      var raw =
        /"hls[24]"\s*:\s*"([^"]+)"/.exec(html) ||
        /file\s*:\s*["']([^"']+)["']/i.exec(html) ||
        /["'](https?:\/\/[^"']+?\/stream\/[^"']+?\.m3u8[^"']*)["']/i.exec(html);
      if (raw) finalUrl = raw[1];
    }

    if (!finalUrl) {
      // Fallback genérico
      finalUrl = findM3u8(html) || findM3u8(unpackPacker(html));
    }

    if (!finalUrl) return null;

    finalUrl = absUrl(url, finalUrl);
    if (finalUrl.indexOf('referer=') < 0) {
      finalUrl += (finalUrl.indexOf('?') >= 0 ? '&' : '?') + 'referer=embed69.org';
    }

    return {
      url: finalUrl,
      quality: quality,
      serverName: 'VidHide',
      headers: {
        'User-Agent': UA,
        Referer: url.split('?')[0],
        Origin: new URL(url).origin,
        'X-Requested-With': 'XMLHttpRequest',
      },
    };
  } catch (e) {
    return null;
  }
}

async function resolveVoe(url) {
  try {
    var html = await httpGet(url);
    if (!html) return null;

    // Redirect corto
    if (html.indexOf('window.location.href') >= 0 && html.length < 2000) {
      var m = /window\.location\.href\s*=\s*['"]([^'"]+)['"]/i.exec(html);
      if (m) return resolveVoe(m[1]);
    }

    var m3u8 = findM3u8(html);
    if (m3u8) {
      return {
        url: m3u8,
        quality: '1080p',
        serverName: 'VOE',
        headers: { 'User-Agent': UA, Referer: url },
      };
    }
  } catch (e) {}
  return null;
}

async function resolveDoodstream(url) {
  try {
    var embedUrl = url;
    if (embedUrl.indexOf('/e/') < 0) {
      embedUrl = embedUrl.replace(/\/(d|f)\//, '/e/');
    }
    var res = await httpGet(embedUrl, { Referer: 'https://lamovie.cc/' });
    if (!res) return null;

    var match = /\$\.get\(\s*['"](\/pass_md5\/[\w-]+)\/([\w-]+)['"]/.exec(res);
    if (!match) return null;

    var passPath = match[1];
    var token = match[2];
    var domain = new URL(embedUrl).origin;
    var passRes = await httpGet(domain + passPath, { Referer: embedUrl });
    if (!passRes) return null;

    var videoBase = passRes.trim();
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var rnd = '';
    for (var i = 0; i < 10; i++) rnd += chars[Math.floor(Math.random() * chars.length)];
    var expiry = Date.now();
    var finalUrl = videoBase + rnd + '?token=' + token + '&expiry=' + expiry;

    return {
      url: finalUrl,
      quality: '720p',
      serverName: 'DoodStream',
      headers: { 'User-Agent': UA, Referer: domain + '/' },
    };
  } catch (e) {
    return null;
  }
}

async function resolveGeneric(url) {
  try {
    var html = await httpGet(url, { Referer: BASE + '/' });
    if (!html) return null;

    // Player intermedio de Cuevana: var url = '...'
    var m1 = /var url = '([^']+)'/.exec(html) || /var url = "([^"]+)"/.exec(html);
    if (m1) {
      var redirected = mapDomain(m1[1]);
      // Reintentar con el redirect (evitar bucle infinito)
      if (redirected !== url) {
        return extract(redirected);
      }
    }

    var unpacked = unpackPacker(html);
    var streamUrl = findM3u8(unpacked) || findM3u8(html);

    if (!streamUrl) {
      var fileM = /file\s*:\s*["']([^"']+)["']/i.exec(unpacked || html);
      if (fileM && (/\.m3u8|\.mp4/i.test(fileM[1]))) {
        streamUrl = fileM[1].replace(/\\/g, '');
      }
    }

    if (!streamUrl) return null;
    streamUrl = absUrl(url, streamUrl);

    var origin = '';
    try { origin = new URL(url).origin; } catch (e) {}

    return {
      url: streamUrl,
      quality: 'Auto',
      serverName: 'Server',
      headers: {
        'User-Agent': UA,
        Referer: url,
        Origin: origin,
      },
    };
  } catch (e) {
    return null;
  }
}

// ─── EXTRACTOR PRINCIPAL ─────────────────────────────────
async function extract(embedUrl) {
  if (!embedUrl) return null;
  embedUrl = mapDomain(String(embedUrl).trim());

  var server = detectServer(embedUrl);
  var result = null;

  try {
    switch (server) {
      case 'streamwish':
        result = await resolveStreamWish(embedUrl);
        break;
      case 'vidhide':
        result = await resolveVidHide(embedUrl);
        break;
      case 'voe':
        result = await resolveVoe(embedUrl);
        break;
      case 'doodstream':
        result = await resolveDoodstream(embedUrl);
        break;
      default:
        result = await resolveGeneric(embedUrl);
    }
  } catch (e) {
    result = null;
  }

  // Si el específico falló, intentar genérico
  if (!result || !result.url) {
    result = await resolveGeneric(embedUrl);
  }

  // Solo aceptar si es realmente un stream reproducible
  if (result && result.url) {
    var u = result.url.toLowerCase();
    if (
      u.indexOf('.m3u8') >= 0 ||
      u.indexOf('.mp4') >= 0 ||
      u.indexOf('/hls/') >= 0 ||
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
  if (dateStr && String(dateStr).length >= 4) year = parseInt(String(dateStr).slice(0, 4), 10);
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
    if (vids.length) {
      groups.push({ language: langMap[key], videos: vids });
    }
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
  // unique
  candidates = candidates.filter(function (v, i, a) { return a.indexOf(v) === i; });

  for (var i = 0; i < candidates.length; i++) {
    var html = await httpGet(candidates[i], {
      Accept: 'text/html',
      'Accept-Language': 'es-ES,es;q=0.9',
    });
    if (html && html.indexOf('__NEXT_DATA__') >= 0 && html.indexOf('"thisMovie"') >= 0) {
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
      BASE + '/episodio/' + slug + '-temporada-' + season + '-episodio-' + episode
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
    if (html && html.indexOf('__NEXT_DATA__') >= 0 && html.indexOf('"episode"') >= 0) {
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

      // Siempre intentar extraer el HLS/MP4 real
      var extracted = await extract(embedUrl);

      // FILTRO: solo devolver streams reales (.m3u8 / .mp4)
      // Si falla, NO devolver el embed puro
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
