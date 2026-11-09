"use strict";

function b64decode(input) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var str = String(input).replace(/[^A-Za-z0-9+\/]/g, "");
    var out = "";
    var buffer = 0;
    var bits = 0;
    for (var i = 0; i < str.length; i++) {
        buffer = (buffer << 6) | chars.indexOf(str.charAt(i));
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out += String.fromCharCode((buffer >> bits) & 255);
            buffer &= (1 << bits) - 1;
        }
    }
    return out;
}

var PROVIDER_NAME = "frprpkjfjdj";
var SITE_BASE = b64decode("aHR0cHM6Ly93d3cuZmxpeGNvcm4ubmV0");
var TMDB_API_KEY = "56db0ec297530920213e1503706b81ff";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var MOBILE_UA = "Mozilla/5.0 (Linux; Android 13; moto g82 5G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36";

// true: agrega una tarjeta "⚠" con lo que falló. Ponlo en false cuando todo funcione.
var DEBUG = true;
// true: descarta los enlaces que la página no marca como latino.
var SOLO_LATINO = true;

// Series cuyo slug en flixcorn no sale de los títulos de TMDB: { "id de TMDB": "slug" }
var SLUG_OVERRIDES = {
    "293610": "doctor-x-la-era-de-la-mafia-blanca"
};

var ENABLED_SOURCES = {
    Vidara: true,     // en unas series funciona y en otras no
    Voe: true,        // a veces pide verificación anti-bot
    Streamwish: true, // Streamwish / Vidhide / Filelions / Lulustream
    Streamtape: true
};

// ─────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────
function getOrigin(url) {
    var m = String(url || "").match(/^(https?:\/\/[^\/?#]+)/i);
    return m ? m[1] : "";
}
function getHost(url) {
    return getOrigin(url).replace(/^https?:\/\//i, "").toLowerCase();
}
function stripAccents(s) {
    try { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, ""); }
    catch (_) { return String(s); }
}
function slugify(s) {
    return stripAccents(s)
        .toLowerCase()
        .replace(/['’`´]/g, "")
        .replace(/&/g, " y ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
function absUrl(u, base) {
    u = String(u || "").trim();
    if (/^\/\//.test(u)) return "https:" + u;
    if (/^\//.test(u)) return getOrigin(base) + u;
    return u;
}
function fetchText(url, referer, extraHeaders) {
    var headers = {
        "User-Agent": UA,
        "Referer": referer || (SITE_BASE + "/"),
        "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-MX,es;q=0.9,en;q=0.8"
    };
    if (extraHeaders) for (var k in extraHeaders) headers[k] = extraHeaders[k];
    return fetch(url, { headers: headers }).then(function (resp) {
        return resp.text().then(function (t) {
            return { ok: resp.ok, status: resp.status, url: resp.url || url, html: t };
        });
    });
}

// ─────────────────────────────────────────────
// TMDB -> títulos
// ─────────────────────────────────────────────
function getTMDBTitles(tmdbId) {
    function fetchLang(lang) {
        var url = "https://api.themoviedb.org/3/tv/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=" + lang;
        return fetch(url, { headers: { "User-Agent": UA } })
            .then(function (resp) { return resp.ok ? resp.json() : null; })
            .then(function (data) { return data && data.success === false ? null : data; })
            .catch(function () { return null; });
    }
    return Promise.all([fetchLang("es-MX"), fetchLang("en-US")]).then(function (r) {
        var titles = [];
        var seen = {};
        [r[0], r[1]].forEach(function (d) {
            if (!d) return;
            [d.name, d.original_name].forEach(function (t) {
                if (!t) return;
                var key = slugify(t);
                if (!key || seen[key]) return;
                seen[key] = true;
                titles.push(t);
            });
        });
        return titles;
    });
}

// ─────────────────────────────────────────────
// Página del capítulo
// ─────────────────────────────────────────────
function fetchEpisodePage(tmdbId, titles, season, episode) {
    var slugs = [];
    var forced = SLUG_OVERRIDES[String(tmdbId)];
    if (forced) slugs.push(forced);
    titles.forEach(function (t) {
        var sl = slugify(t);
        // Un slug de menos de 3 letras (ej. "x") nunca es una serie real
        if (sl.length >= 3 && slugs.indexOf(sl) === -1) slugs.push(sl);
    });
    var tried = [];
    return Promise.all(slugs.slice(0, 5).map(function (slug) {
        var url = SITE_BASE + "/ver/" + slug + "/temporada-" + season + "/capitulo-" + episode + ".html";
        return fetchText(url).then(function (r) {
            // El sitio responde 200 aunque la página no exista, por eso se buscan los servidores
            var hasServers = r.ok && (r.html.indexOf("/player/") !== -1 || r.html.indexOf("/external/") !== -1);
            tried.push(slug + ": HTTP " + r.status + (r.ok && !hasServers ? " sin servidores" : ""));
            return hasServers ? { slug: slug, url: url, html: r.html } : null;
        }).catch(function (e) {
            tried.push(slug + ": " + e.message);
            return null;
        });
    })).then(function (pages) {
        var found = null;
        for (var i = 0; i < pages.length; i++) if (pages[i]) { found = pages[i]; break; }
        return { page: found, tried: tried };
    });
}

function lastMatch(re, text) {
    var last = null;
    var m;
    while ((m = re.exec(text)) !== null) last = m;
    return last;
}

// Cada servidor es un enlace /player/<código> (o /external/<código>).
// El idioma y la calidad aparecen antes (imagen language/<idioma>.png y "720p").
function collectCodes(html, kind) {
    var re = new RegExp("/" + kind + "/([A-Za-z0-9]+)", "g");
    var servers = [];
    var seen = {};
    var prevIndex = 0;
    var m;
    while ((m = re.exec(html)) !== null) {
        var code = m[1];
        if (seen[code]) continue;
        seen[code] = true;
        var chunk = html.slice(Math.max(prevIndex, m.index - 1500), m.index);
        var lang = lastMatch(/language\/([a-z]+)\.(?:png|webp|svg|jpg)/gi, chunk);
        var quality = lastMatch(/(\d{3,4})p/g, chunk);
        servers.push({
            code: code,
            lang: lang ? lang[1].toLowerCase() : "lat",
            quality: quality ? quality[1] + "p" : "HD"
        });
        prevIndex = m.index;
    }
    return servers;
}
function parseServers(html) {
    var online = collectCodes(html, "player");
    return online.length > 0 ? online : collectCodes(html, "external");
}

// ─────────────────────────────────────────────
// Código de servidor -> URL del embed
// ─────────────────────────────────────────────
function isExternalUrl(u) {
    var ownHost = getHost(SITE_BASE).replace(/^www\./, "");
    return /^https?:\/\//i.test(u) && getHost(u).indexOf(ownHost) === -1;
}
var SOCIAL_RE = /facebook\.|twitter\.|x\.com|instagram\.|t\.me\/|telegram\.|discord\.|youtube\.|youtu\.be|themoviedb\.|google\.|whatsapp\.|tiktok\./i;

function findUrlInJson(value, depth) {
    if (depth === undefined) depth = 0;
    if (depth > 4 || value === null || value === undefined) return null;
    if (typeof value === "string") return isExternalUrl(value) ? value : null;
    if (typeof value === "object") {
        var keys = Object.keys(value);
        for (var i = 0; i < keys.length; i++) {
            var found = findUrlInJson(value[keys[i]], depth + 1);
            if (found) return found;
        }
    }
    return null;
}

// Busca el embed en el HTML de /player o /external: iframe, redirecciones, data-*, base64, enlaces.
function findEmbedInHtml(html, baseUrl) {
    var unescaped = html.replace(/\\\//g, "/").replace(/&amp;/g, "&");
    var m;
    var ifr = /<iframe[^>]+?(?:data-src|src)=["']([^"']+)["']/gi;
    while ((m = ifr.exec(unescaped)) !== null) {
        var u = absUrl(m[1], baseUrl);
        if (isExternalUrl(u) && !SOCIAL_RE.test(u)) return u;
    }
    var embRe = /https?:\/\/[a-z0-9.-]+\/(?:e|embed|embed-[a-z0-9]*|v)\/[A-Za-z0-9_-]+/gi;
    while ((m = embRe.exec(unescaped)) !== null) {
        if (isExternalUrl(m[0]) && !SOCIAL_RE.test(m[0])) return m[0];
    }
    m = unescaped.match(/http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)["']/i);
    if (m && isExternalUrl(m[1])) return m[1];
    var locRe = /location(?:\.href)?\s*(?:=|\.replace\(|\.assign\()\s*["'](https?:\/\/[^"']+)["']/gi;
    while ((m = locRe.exec(unescaped)) !== null) {
        if (isExternalUrl(m[1])) return m[1];
    }
    var dataRe = /data-(?:url|href|link|target|src)=["']([^"']+)["']/gi;
    while ((m = dataRe.exec(unescaped)) !== null) {
        var du = absUrl(m[1], baseUrl);
        if (isExternalUrl(du) && !SOCIAL_RE.test(du)) return du;
    }
    var b64Re = /atob\(\s*["']([A-Za-z0-9+\/=_-]{16,})["']\s*\)/g;
    while ((m = b64Re.exec(unescaped)) !== null) {
        try {
            var decoded = b64decode(m[1].replace(/-/g, "+").replace(/_/g, "/"));
            if (isExternalUrl(decoded)) return decoded;
        } catch (_) { }
    }
    var hrefRe = /href=["'](https?:\/\/[^"']+)["']/gi;
    while ((m = hrefRe.exec(unescaped)) !== null) {
        if (isExternalUrl(m[1]) && !SOCIAL_RE.test(m[1])) return m[1];
    }
    return null;
}

// /external/<código>?s=1 redirige o responde JSON/HTML con el embed.
function resolveExternal(code) {
    var pageUrl = SITE_BASE + "/external/" + code;
    return fetch(pageUrl + "?s=1", {
        headers: {
            "User-Agent": UA,
            "Referer": pageUrl,
            "Accept": "application/json, text/html;q=0.9, */*;q=0.8",
            "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
            "X-Requested-With": "XMLHttpRequest"
        }
    }).then(function (resp) {
        var finalUrl = resp.url || "";
        return resp.text().then(function (body) {
            if (isExternalUrl(finalUrl)) return finalUrl;
            try {
                var f = findUrlInJson(JSON.parse(body));
                if (f) return f;
            } catch (_) { }
            return findEmbedInHtml(body, pageUrl);
        });
    });
}

// Primero /player/<código> (trae el iframe); si no sirve, /external/<código>.
function resolveServer(code, referer) {
    return fetchText(SITE_BASE + "/player/" + code, referer).then(function (r) {
        var e = r.ok ? findEmbedInHtml(r.html, r.url) : null;
        return e || resolveExternal(code);
    }).catch(function () {
        return resolveExternal(code);
    });
}

function detectSource(url) {
    var host = getHost(url);
    if (host.indexOf("vidara") !== -1) return "Vidara";
    if (/(^|\.)voe\./.test(host) || host.indexOf("voe") === 0) return "Voe";
    if (/wish|vidhide|filelions|hglink|dhcplay|streamhg|callistanise|dingtezuni|embedwish|swish|vidhidepro|minochinos|lulu|vibuxer|hgcloud/.test(host)) return "Streamwish";
    if (/streamtape|tapecontent|strtape|stape|tape\./.test(host)) return "Streamtape";
    return null;
}

// ─────────────────────────────────────────────
// Extractores: cada uno devuelve Promise<Array<{url, headers, type, label?, format?}>>
// ─────────────────────────────────────────────

// Vidara: POST /api/stream {filecode, device} -> { streaming_url }
function extractVidara(embedUrl) {
    var origin = getOrigin(embedUrl);
    var filecode = embedUrl.split(/[?#]/)[0].split("/").filter(Boolean).pop();
    if (!origin || !filecode) return Promise.reject(Error("Vidara: URL de embed inválida"));
    return fetch(origin + "/api/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": UA, "Referer": embedUrl, "Origin": origin },
        body: JSON.stringify({ filecode: filecode, device: "web" })
    }).then(function (resp) {
        if (!resp.ok) throw Error("Vidara API HTTP " + resp.status + " (el archivo puede no estar en Vidara)");
        return resp.json();
    }).then(function (data) {
        if (!data.streaming_url) throw Error("Vidara: la API no devolvió streaming_url");
        console.log("[Vidara] HLS: " + data.streaming_url);
        return [{ url: data.streaming_url, headers: { "Referer": origin + "/", "User-Agent": UA }, type: "hls" }];
    });
}

// VOE
function rot13(s) {
    return s.replace(/[a-zA-Z]/g, function (c) {
        var base = c <= "Z" ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
}
function voeDecode(enc) {
    var s = rot13(String(enc));
    ["@$", "^^", "~@", "%?", "*~", "!!", "#&"].forEach(function (p) { s = s.split(p).join("_"); });
    s = s.split("_").join("");
    s = b64decode(s);
    var shifted = "";
    for (var i = 0; i < s.length; i++) shifted += String.fromCharCode(s.charCodeAt(i) - 3);
    s = shifted.split("").reverse().join("");
    s = b64decode(s);
    return JSON.parse(s);
}
function voeParse(html) {
    var m = html.match(/<script[^>]+type=["']application\/json["'][^>]*>\s*(\[[\s\S]*?\])\s*<\/script>/i);
    if (m) {
        try {
            var arr = JSON.parse(m[1]);
            var data = voeDecode(typeof arr[0] === "string" ? arr[0] : m[1]);
            var u = data.source || data.direct_access_url || data.file;
            var alt = data.fallback && data.fallback[0] && data.fallback[0].file;
            if (u) return { url: u, type: /\.m3u8/i.test(u) ? "hls" : "mp4", alt: alt || null };
            if (alt) return { url: alt, type: "mp4", alt: null };
        } catch (_) { }
    }
    var h = html.match(/["']hls["']\s*:\s*["']([^"']+)["']/);
    if (h) {
        var hu = /^https?:/i.test(h[1]) ? h[1] : b64decode(h[1]);
        if (/^https?:/i.test(hu)) return { url: hu, type: "hls" };
    }
    var mp = html.match(/["']mp4["']\s*:\s*["']([^"']+)["']/);
    if (mp) {
        var mu = /^https?:/i.test(mp[1]) ? mp[1] : b64decode(mp[1]);
        if (/^https?:/i.test(mu)) return { url: mu, type: "mp4" };
    }
    var s = html.match(/<source[^>]+src=["']([^"']+)["']/i);
    if (s && /^https?:/i.test(s[1])) return { url: s[1], type: /\.m3u8/i.test(s[1]) ? "hls" : "mp4" };
    return null;
}
function extractVoe(embedUrl, hops) {
    hops = hops || 0;
    return fetchText(embedUrl, embedUrl).then(function (r) {
        var found = voeParse(r.html);
        if (found) {
            var origin = getOrigin(r.url);
            console.log("[VOE] " + found.type + ": " + found.url);
            var list = [{
                url: found.url,
                headers: { "Referer": origin + "/", "User-Agent": UA },
                type: found.type,
                format: found.type === "hls" ? "HLS" : "MP4"
            }];
            if (found.alt && found.alt !== found.url) {
                list.push({ url: found.alt, headers: { "User-Agent": UA }, format: "MP4" });
            }
            return list;
        }
        // VOE suele redirigir por JavaScript a otro dominio
        var red = r.html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (red && hops < 3) return extractVoe(absUrl(red[1], r.url), hops + 1);
        if (/captcha|human|verif|robot/i.test(r.html)) throw Error("VOE pide verificación anti-bot");
        throw Error("VOE: no se encontró el video");
    });
}

// Streamwish / Vidhide / Filelions / Lulustream: script empaquetado (p,a,c,k,e,d) con "hls2":...
var PACKED_RE = /eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/;
function unpackPacked(html) {
    var m = html.match(PACKED_RE);
    if (!m) return null;
    var p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    var a = parseInt(m[2], 10);
    var c = parseInt(m[3], 10);
    var k = m[4].split("|");
    function e(n) {
        return (n < a ? "" : e(parseInt(n / a, 10))) + ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
    }
    var d = {};
    while (c--) d[e(c)] = k[c] || e(c);
    return p.replace(/\b\w+\b/g, function (w) { return d[w] || w; });
}
function describePage(html) {
    var t = /<title[^>]*>([^<]*)/i.exec(html || "");
    var scripts = [];
    var re = /<script[^>]+src=["']([^"']+)["']/gi, m;
    while ((m = re.exec(html || "")) !== null && scripts.length < 2) scripts.push(m[1].split("/").pop().slice(0, 30));
    return (html || "").length + "b" +
        ", título=" + (t ? t[1].trim().slice(0, 25) : "?") +
        ", m3u8=" + (/m3u8/.test(html) ? "sí" : "no") +
        ", packer=" + (/eval\(function\(p,a,c,k,e,/.test(html) ? "sí" : "no") +
        ", file:=" + (/file\s*:/.test(html) ? "sí" : "no") +
        (scripts.length ? ", scripts=" + scripts.join(",") : "");
}
function extractWish(embedUrl) {
    // UA móvil y Referer de flixcorn (el iframe vive ahí)
    return fetchText(embedUrl, SITE_BASE + "/", { "User-Agent": MOBILE_UA, "Accept-Language": "es-419,es;q=0.9" }).then(function (r) {
        var origin = getOrigin(r.url || embedUrl);
        var js = r.html;
        var unpacked = unpackPacked(r.html);
        if (unpacked) js = unpacked + "\n" + r.html;
        js = js.replace(/\\\//g, "/");
        var out = [];
        var seen = {};
        var host = getHost(origin);
        var name = /lulu/.test(host) ? "Lulustream" : (/vidhide|filelions|dingtezuni|callistanise|minochinos/.test(host) ? "Vidhide" : "Streamwish");
        function add(label, u) {
            u = absUrl(u, origin);
            if (!/^https?:/i.test(u) || seen[u]) return;
            seen[u] = true;
            // Estos encabezados son los que sí reproducen en Nuvio (probado con Lulustream)
            out.push({
                url: u,
                headers: { "Referer": origin + "/", "Origin": origin, "User-Agent": MOBILE_UA, "Accept": "*/*", "Accept-Language": "es-419,es;q=0.9" },
                type: "hls",
                label: name + " " + label
            });
        }
        var re = /["']?(hls\d?)["']?\s*:\s*["']([^"']+)["']/g;
        var m;
        while ((m = re.exec(js)) !== null) add(m[1], m[2]);
        if (out.length === 0) {
            var f = /file\s*:\s*["']([^"']+\.(?:m3u8|txt)[^"']*)["']/g;
            while ((m = f.exec(js)) !== null) add("hls", m[1]);
        }
        if (out.length === 0) {
            var any = /["'](https?:\/\/[^"'\s\\<>]+\.m3u8[^"'\s\\<>]*|\/[^"'\s\\<>]+\.m3u8[^"'\s\\<>]*)["']/g;
            while ((m = any.exec(js)) !== null) add("hls", m[1]);
        }
        if (out.length === 0) throw Error(name + ": no se encontró ningún hls (" + describePage(r.html) + ")");
        return out;
    });
}

// Streamtape: el embed arma el enlace con getElementById('robotlink'/'botlink').innerHTML
function embedId(u) {
    var clean = String(u).replace(/[?#].*$/, "");
    var m = /\/(?:e|d|v|embed)\/([A-Za-z0-9_-]+)/.exec(clean);
    return m ? m[1] : clean.replace(/\/+$/, "").split("/").pop();
}
function extractStreamtapeFromHtml(html) {
    var re = /getElementById\('(?:robotlink|botlink)'\)\.innerHTML\s*=\s*['"]([^'"]*)['"]\s*\+\s*(?:''\s*\+\s*)?\(\s*['"]([^'"]*)['"]\s*\)((?:\.substring\(\d+\))*)/g;
    var m, last = null;
    while ((m = re.exec(html)) !== null) last = m; // 'ideoolink' son señuelos
    if (!last) return null;
    var tail = last[2];
    (last[3].match(/\.substring\(\d+\)/g) || []).forEach(function (s) {
        tail = tail.substring(parseInt(/\d+/.exec(s)[0], 10));
    });
    var url = last[1] + tail;
    if (url.indexOf("//") === 0) url = "https:" + url;
    return url + "&stream=1";
}
function extractStreamtape(embedUrl) {
    if (embedUrl.indexOf("//") === 0) embedUrl = "https:" + embedUrl;
    var sid = embedId(embedUrl);
    var cands = [embedUrl, "https://streamtape.com/e/" + sid, "https://streamtape.com/v/" + sid,
        "https://streamtape.net/e/" + sid, "https://streamtape.to/e/" + sid]
        .filter(function (v, i, a) { return a.indexOf(v) === i; });
    var lastErr = null;
    function tryNext(i) {
        if (i >= cands.length) throw lastErr || Error("No se encontró el enlace en el embed de Streamtape");
        return fetchText(cands[i], SITE_BASE + "/").then(function (r) {
            var url = extractStreamtapeFromHtml(r.html);
            if (url) return [{ url: url, headers: { "Referer": "https://streamtape.com/", "User-Agent": UA }, format: "MP4" }];
            lastErr = Error("Streamtape: sin enlace en " + getHost(cands[i]));
            return tryNext(i + 1);
        }, function (e) { lastErr = e; return tryNext(i + 1); });
    }
    return tryNext(0);
}

var ALL_SOURCES = {
    Vidara: { label: "Vidara", format: "HLS", extract: extractVidara },
    Voe: { label: "VOE", format: "HLS", extract: extractVoe },
    Streamwish: { label: "Streamwish", format: "HLS", extract: extractWish },
    Streamtape: { label: "Streamtape", format: "MP4", extract: extractStreamtape }
};
var SOURCE_EXTRACTORS = {};
Object.keys(ALL_SOURCES).forEach(function (key) {
    if (ENABLED_SOURCES[key]) SOURCE_EXTRACTORS[key] = ALL_SOURCES[key];
});

function getLangLabel(lang) {
    var l = String(lang || "").toLowerCase();
    if (l === "lat" || l === "latino" || l === "") return "🇲🇽 LATINO";
    if (l === "esp" || l === "es" || l === "cast" || l === "cas") return "🇪🇸 CASTELLANO";
    if (l === "sub" || l === "en" || l === "jp") return "🌐 SUBTITULADO";
    return "🌐 " + l.toUpperCase();
}

// ─────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────
exports.getStreams = function (tmdbId, type, season, episode) {
    if (!tmdbId || type !== "tv") return Promise.resolve([]);
    var seasonNum = season ? Number(season) : 1;
    var episodeNum = episode !== undefined && episode !== null ? Number(episode) : 1;
    console.log("[" + PROVIDER_NAME + "] Buscando: TMDB " + tmdbId + " S" + seasonNum + "E" + episodeNum);

    function debugCard(reason) {
        console.warn("[" + PROVIDER_NAME + "] " + reason);
        return { name: PROVIDER_NAME, title: "", url: "https://example.invalid/debug", quality: "⚠ " + reason };
    }
    function fail(reason) {
        return DEBUG ? [debugCard(reason)] : [];
    }

    return getTMDBTitles(tmdbId).then(function (titles) {
        if (titles.length === 0 && !SLUG_OVERRIDES[String(tmdbId)]) return fail("TMDB no devolvió título (id " + tmdbId + ")");
        return fetchEpisodePage(tmdbId, titles, seasonNum, episodeNum).then(function (res) {
            var page = res.page;
            if (!page) return fail("Sin capítulo. Títulos: " + titles.slice(0, 6).join(" / ") + ". Intentos: " + (res.tried.join(" | ") || "ninguno"));
            console.log("[" + PROVIDER_NAME + "] Capítulo encontrado: " + page.slug);

            var allServers = parseServers(page.html);
            if (allServers.length === 0) return fail("Capítulo " + page.slug + " sin códigos de servidor");

            var servers = SOLO_LATINO ? allServers.filter(function (sv) { return sv.lang.indexOf("lat") !== -1; }) : allServers;
            if (servers.length === 0) {
                var idiomas = allServers.map(function (sv) { return sv.lang; })
                    .filter(function (v, i, a) { return a.indexOf(v) === i; }).join(", ");
                return fail("Sin enlaces en latino (idiomas encontrados: " + idiomas + ")");
            }

            var errors = [];
            return Promise.all(servers.map(function (server) {
                var embedSeen = "";
                return resolveServer(server.code, page.url).then(function (embedUrl) {
                    embedSeen = embedUrl || "";
                    if (!embedUrl) {
                        errors.push(server.code + ": sin embed");
                        return [];
                    }
                    var sourceKey = detectSource(embedUrl);
                    if (!sourceKey || !SOURCE_EXTRACTORS[sourceKey]) {
                        errors.push(server.code + ": " + getHost(embedUrl) + " no soportado");
                        return [];
                    }
                    var source = SOURCE_EXTRACTORS[sourceKey];
                    return source.extract(embedUrl).then(function (list) {
                        return list.map(function (resolved) {
                            var s = {
                                name: PROVIDER_NAME,
                                title: "",
                                url: resolved.url,
                                quality: "📺 " + (resolved.label || source.label) + " (" + (resolved.format || source.format) + ")\n" +
                                    server.quality + " | WEB-DL\n" + getLangLabel(server.lang) +
                                    (DEBUG ? "\n🔗 " + String(resolved.url).slice(0, 150) : ""),
                                headers: resolved.headers
                            };
                            if (resolved.type) s.type = resolved.type;
                            return s;
                        });
                    });
                }).catch(function (e) {
                    errors.push(server.code + ": " + e.message + (embedSeen ? " [" + embedSeen + "]" : ""));
                    console.warn("[" + PROVIDER_NAME + "] Falló un servidor: " + e.message);
                    return [];
                });
            })).then(function (lists) {
                var final = [];
                lists.forEach(function (l) { final = final.concat(l); });
                if (final.length === 0) {
                    return fail("Sin streams. " + servers.length + " códigos. " + errors.slice(0, 4).join(" | "));
                }
                console.log("[" + PROVIDER_NAME + "] ✓ " + final.length + " streams devueltos");
                if (DEBUG && errors.length > 0) final.push(debugCard(errors.slice(0, 8).join(" | ")));
                return final;
            });
        });
    }).catch(function (e) {
        return fail("Error: " + e.message);
    });
};
