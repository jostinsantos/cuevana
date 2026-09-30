/**
 * Fuente Cuevana — lógica en el repo (GitHub).
 * getStreams(tmdbId, type, season, episode) → lista de streams
 * extract(embedUrl) → m3u8/mp4 resuelto o null
 *
 * La app no scrapeaa Cuevana: solo ejecuta este JS.
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
  'streamwish.to': 'hgplaycdn.com',
  'vidhidepro.com': 'callistanise.com',
  'filelions.to': 'callistanise.com'
};

// ─── helpers ─────────────────────────────────────────────
async function httpGet(url, headers) {
  var h = Object.assign({ 'User-Agent': UA, Accept: '*/*' }, headers || {});
  var res = await fetch(url, { headers: h });
  if (!res.ok) return null;
  return await res.text();
}

async function httpGetJson(url) {
  var res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!res.ok) return null;
  return await res.json();
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
  try {
    var u = new URL(url);
    var host = u.host.toLowerCase();
    Object.keys(DOMAIN_MAP).forEach(function (k) {
      if (host.indexOf(k) >= 0) {
        u.host = host.split(k).join(DOMAIN_MAP[k]);
      }
    });
    return u.toString();
  } catch (e) {
    return url;
  }
}

// ─── TMDB titles ─────────────────────────────────────────
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

// ─── NEXT_DATA ───────────────────────────────────────────
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

// ─── resolve embed → m3u8 (player.php style + extractors) ─
async function resolvePlayer(sourceUrl) {
  if (!sourceUrl) return null;
  var html = await httpGet(sourceUrl);
  if (!html) return null;
  var videoUrl = null;
  var m1 = /var url = '([^']+)'/.exec(html);
  if (m1) videoUrl = m1[1];
  if (!videoUrl) {
    var m2 = /var url = "([^"]+)"/.exec(html);
    if (m2) videoUrl = m2[1];
  }
  if (!videoUrl) {
    var m3 = /(?:file|src|source)\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i.exec(html);
    if (m3) videoUrl = m3[1];
  }
  if (!videoUrl) return null;
  return mapDomain(videoUrl);
}

/** Extractor público: embed → stream directo */
async function extract(embedUrl) {
  // 1) genérico var url / m3u8 en HTML
  var resolved = await resolvePlayer(embedUrl);
  if (resolved) {
    return {
      url: resolved,
      quality: 'HD',
      serverName: 'generic',
      headers: { 'User-Agent': UA, Referer: embedUrl },
    };
  }
  // 2) StreamWish-like packed / file:
  try {
    var html = await httpGet(embedUrl, { Referer: embedUrl });
    if (html) {
      var fileM = /file\s*:\s*["']([^"']+)["']/i.exec(html);
      if (fileM) {
        var u = fileM[1].replace(/\\/g, '');
        return {
          url: u,
          quality: 'Auto',
          serverName: 'streamwish',
          headers: {
            'User-Agent': UA,
            Referer: embedUrl,
            Origin: new URL(embedUrl).origin,
          },
        };
      }
      var m3 = /https?:\/\/[^\s"']+\.m3u8[^\s"']*/i.exec(html);
      if (m3) {
        return {
          url: m3[0],
          quality: 'HD',
          serverName: 'm3u8',
          headers: { 'User-Agent': UA, Referer: embedUrl },
        };
      }
    }
  } catch (e) {}
  return null;
}

// ─── scrape ──────────────────────────────────────────────
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

/**
 * API principal (compatible Nuvio / app).
 * @returns {Promise<Array<{url,title,quality,language,headers?}>>}
 */
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

      // 1) URL del embed (cyberlocker)
      var embed = video.url;
      if (!embed) continue;

      // 2) Pasar SIEMPRE por extractor
      var playUrl = null;
      var headers = { 'User-Agent': UA, Referer: BASE + '/' };
      var quality = video.quality || 'HD';

      var resolved = await resolvePlayer(embed);
      if (resolved && (resolved.indexOf('.m3u8') >= 0 || resolved.indexOf('.mp4') >= 0)) {
        playUrl = resolved;
      } else {
        var ex = await extract(resolved || embed);
        if (ex && ex.url) {
          playUrl = ex.url;
          if (ex.headers) headers = ex.headers;
          if (ex.quality) quality = ex.quality;
        }
      }

      // 3) Si hay m3u8/mp4 → ese; si no → el embed (la app también puede reintentar extract)
      var finalUrl = playUrl || embed;
      if (seen[finalUrl]) continue;
      seen[finalUrl] = true;

      var name = video.cyberlocker
        ? video.cyberlocker.charAt(0).toUpperCase() + video.cyberlocker.slice(1)
        : 'Servidor';
      out.push({
        url: finalUrl,
        title: 'Cuevana · ' + name + (playUrl ? '' : ' (embed)'),
        quality: quality,
        language: langCode(group.language),
        headers: headers,
      });
    }
  }
  return out;
}

module.exports = {
  getStreams: getStreams,
  extract: extract,
};
