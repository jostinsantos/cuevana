/**
 * Fuente Cuevana — Extracción directa HLS (.m3u8) / MP4
 * getStreams(tmdbId, type, season, episode) → lista de streams directos
 * extract(embedUrl) → m3u8/mp4 resuelto o null
 */

var TMDB_KEY = 'a2d9bbed370d9f678e34006f8750a5a5';
var TMDB = 'https://api.themoviedb.org/3';
var BASE = 'https://wv3.cuevana3.eu';
var UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

var ALLOWED = [
  'streamwish', 'vidhide', 'filelions', 'vidhidepro',
  'streamwish.to', 'vidhidepro.com', 'filelions.com', 'filelions.to',
  'voe', 'dood', 'ok.ru', 'filemoon'
];

var DOMAIN_MAP = {
  'streamwish.to': 'playnixes.com',
  'vidhidepro.com': 'callistanise.com',
  'filelions.to': 'callistanise.com',
  'filelions.com': 'callistanise.com'
};

// ─── HELPERS ─────────────────────────────────────────────
async function httpGet(url, headers) {
  try {
    var h = Object.assign({ 'User-Agent': UA, 'Accept': '*/*' }, headers || {});
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
  Object.keys(DOMAIN_MAP).forEach(function (k) {
    if (out.indexOf(k) >= 0) {
      out = out.split(k).join(DOMAIN_MAP[k]);
    }
  });
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
    return out;
  }
}

// Desempaquetador Dean Edwards p.a.c.k.e.r (Usado por StreamWish, VidHide, etc.)
function unpackPacker(code) {
  try {
    var evalRegex = /eval\(function\(p,a,c,k,e,r\)/;
    if (!evalRegex.test(code)) return code;

    var match = /}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/.exec(code);
    if (!match) return code;

    var p = match[1];
    var a = parseInt(match[2], 10);
    var c = parseInt(match[3], 10);
    var k = match[4].split('|');

    function e(c) {
      return (c < a ? '' : e(parseInt(c / a, 10))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
    }

    while (c--) {
      if (k[c]) {
        p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
      }
    }
    return p;
  } catch (err) {
    return code;
  }
}

// ─── EXTRACTOR CORE ──────────────────────────────────────
async function extract(embedUrl) {
  if (!embedUrl) return null;
  embedUrl = mapDomain(embedUrl);

  try {
    var html = await httpGet(embedUrl, { Referer: BASE + '/' });
    if (!html) return null;

    // A) Si es un player intermedio de Cuevana (ej. player.php?h=...)
    var redirectUrl = null;
    var m1 = /var url = '([^']+)'/.exec(html) || /var url = "([^"]+)"/.exec(html);
    if (m1) redirectUrl = m1[1];

    if (redirectUrl) {
      embedUrl = mapDomain(redirectUrl);
      html = await httpGet(embedUrl, { Referer: BASE + '/' });
      if (!html) return null;
    }

    // B) Buscar si el HTML contiene JS empaquetado (eval(function(p,a,c,k...)))
    var unpacked = unpackPacker(html);

    // C) Extraer enlace HLS (.m3u8) o MP4
    var streamUrl = null;

    // Patrón 1: file:"https://...m3u8" o sources:[{file:...}]
    var fileMatch = /file\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i.exec(unpacked) ||
                      /file\s*:\s*["']([^"']+)["']/i.exec(unpacked);

    if (fileMatch) {
      streamUrl = fileMatch[1].replace(/\\/g, '');
    }

    // Patrón 2: Captura directa de regex de URL HTTP(S) con .m3u8 o .mp4
    if (!streamUrl) {
      var directMatch = /(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*)/i.exec(unpacked);
      if (directMatch) streamUrl = directMatch[0];
    }

    // Validar que el stream sea una URL válida
    if (streamUrl && (streamUrl.indexOf('.m3u8') >= 0 || streamUrl.indexOf('.mp4') >= 0)) {
      var parsedOrigin = '';
      try { parsedOrigin = new URL(embedUrl).origin; } catch (e) {}

      return {
        url: streamUrl,
        quality: 'Auto',
        headers: {
          'User-Agent': UA,
          'Referer': embedUrl,
          'Origin': parsedOrigin
        }
      };
    }
  } catch (e) {}

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
    if (vids.length) groups.push({ language: langMap[key], videos: vids });
  });
  return groups;
}

async function findWorkingUrl(candidates, needle) {
  for (var i = 0; i < candidates.length; i++) {
    var html = await httpGet(candidates[i], {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'es-ES,es;q=0.9',
    });
    if (html && html.indexOf('__NEXT_DATA__') >= 0 && html.indexOf(needle) >= 0) {
      return { url: candidates[i], html: html };
    }
  }
  return null;
}

function buildMovieCandidates(tmdb) {
  var prefix = BASE + '/ver-pelicula/';
  var titles = [tmdb.latino, tmdb.castellano, tmdb.ingles];
  var out = [];
  titles.forEach(function (title) {
    if (!title || !String(title).trim()) return;
    var slug = slugify(title);
    if (!slug) return;
    out.push(prefix + slug);
    out.push(prefix + slug + '-' + tmdb.id);
    if (tmdb.year) out.push(prefix + slug + '-' + tmdb.year);
  });
  return Array.from(new Set(out));
}

async function scrapeMovie(tmdb) {
  var candidates = buildMovieCandidates(tmdb);
  var found = await findWorkingUrl(candidates, '"thisMovie"');
  if (!found) return [];
  var pageProps = extractNextData(found.html);
  if (!pageProps || !pageProps.thisMovie) return [];
  var videos = pageProps.thisMovie.videos;
  if (!videos) return [];
  return videoGroupsFromData(videos);
}

async function scrapeEpisode(tmdb, season, episode) {
  var nombres = [tmdb.latino, tmdb.castellano, tmdb.ingles].filter(function (n) {
    return n && String(n).trim();
  });
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
  var found = null;
  for (var i = 0; i < candidates.length; i++) {
    var html = await httpGet(candidates[i], {
      Accept: 'text/html',
      'Accept-Language': 'es-ES,es;q=0.9',
    });
    if (html && html.indexOf('__NEXT_DATA__') >= 0 && html.indexOf('"episode"') >= 0) {
      found = { html: html };
      break;
    }
  }
  if (!found) return [];
  var pageProps = extractNextData(found.html);
  if (!pageProps || !pageProps.episode || !pageProps.episode.videos) return [];
  return videoGroupsFromData(pageProps.episode.videos);
}

// ─── MAIN METHOD ─────────────────────────────────────────
async function getStreams(tmdbId, type, season, episode) {
  var id = parseInt(tmdbId, 10);
  if (!id) return [];
  var isMovie = String(type).toLowerCase().indexOf('tv') < 0 && String(type).toLowerCase().indexOf('series') < 0;
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

      // Invocar siempre al extractor
      var extracted = await extract(embedUrl);

      // FILTRO CRÍTICO: Si no se logró extraer un HLS/MP4 (.m3u8), SE OMITE el servidor.
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
        headers: extracted.headers,
      });
    }
  }
  return out;
}

module.exports = {
  getStreams: getStreams,
  extract: extract,
};