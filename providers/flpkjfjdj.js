"use strict";
// providers/flpkjfjdj.js
// Provider Nuvio (series) para un sitio con URLs del tipo
//   /ver/<serie>/temporada-N/capitulo-M.html
//
// Flujo:
//   TMDB -> títulos -> slug(s) -> página del capítulo -> códigos de servidores
//   -> /external/<código> -> embed real -> extractor (Vidara).
//
// Contrato Nuvio: exports.getStreams(tmdbId, type, season, episode) -> Promise<Array<Stream>>
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
// Decodificador base64 propio: no depende de que el entorno tenga `atob`
// (se usa al cargar el archivo, y si faltara el plugin entero dejaría de cargar).
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
var PROVIDER_NAME = "flpkjfjdj"; // nombre visible en los logs y en la lista de streams
var SITE_BASE = b64decode("aHR0cHM6Ly93d3cuZmxpeGNvcm4ubmV0");
var TMDB_API_KEY = "56db0ec297530920213e1503706b81ff";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
// Switch de sources: true/false para activar o desactivar cada uno.
// DEBUG: true muestra en la lista de streams el motivo por el que no se encontró nada.
// Ponlo en false cuando todo funcione.
var DEBUG = true;
var ENABLED_SOURCES = {
    Vidara: true // HLS vía POST /api/stream
};
// ─────────────────────────────────────────────
// Utilidades (sin depender de URL, que en React Native está incompleta)
// ─────────────────────────────────────────────
function getOrigin(url) {
    var m = String(url || "").match(/^(https?:\/\/[^\/?#]+)/i);
    return m ? m[1] : "";
}
function getHost(url) {
    return getOrigin(url).replace(/^https?:\/\//i, "").toLowerCase();
}
function stripAccents(s) {
    try {
        return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }
    catch (_) {
        return String(s);
    }
}
function slugify(s) {
    return stripAccents(s)
        .toLowerCase()
        .replace(/['’`´]/g, "")
        .replace(/&/g, " y ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
// ─────────────────────────────────────────────
// TMDB -> títulos
// ─────────────────────────────────────────────
function getTMDBTitles(tmdbId) {
    return __awaiter(this, void 0, void 0, function () {
        var fetchLang, _a, es, en, titles, seen, _i, _b, d, _c, _d, t, key;
        var _this = this;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    fetchLang = function (lang) { return __awaiter(_this, void 0, void 0, function () {
                        var url, resp, data, _1;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    _a.trys.push([0, 3, , 4]);
                                    url = "https://api.themoviedb.org/3/tv/".concat(tmdbId, "?api_key=").concat(TMDB_API_KEY, "&language=").concat(lang);
                                    return [4 /*yield*/, fetch(url, { headers: { "User-Agent": UA } })];
                                case 1:
                                    resp = _a.sent();
                                    if (!resp.ok)
                                        return [2 /*return*/, null];
                                    return [4 /*yield*/, resp.json()];
                                case 2:
                                    data = _a.sent();
                                    return [2 /*return*/, data && data.success === false ? null : data];
                                case 3:
                                    _1 = _a.sent();
                                    return [2 /*return*/, null];
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); };
                    return [4 /*yield*/, Promise.all([fetchLang("es-MX"), fetchLang("en-US")])];
                case 1:
                    _a = _e.sent(), es = _a[0], en = _a[1];
                    if (!es && !en)
                        return [2 /*return*/, []];
                    titles = [];
                    seen = {};
                    for (_i = 0, _b = [es, en]; _i < _b.length; _i++) {
                        d = _b[_i];
                        if (!d)
                            continue;
                        for (_c = 0, _d = [d.name, d.original_name]; _c < _d.length; _c++) {
                            t = _d[_c];
                            if (!t)
                                continue;
                            key = slugify(t);
                            if (!key || seen[key])
                                continue;
                            seen[key] = true;
                            titles.push(t);
                        }
                    }
                    return [2 /*return*/, titles];
            }
        });
    });
}
// ─────────────────────────────────────────────
// Página del capítulo
// ─────────────────────────────────────────────
function fetchHtml(url) {
    return __awaiter(this, void 0, void 0, function () {
        var resp, html, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, fetch(url, {
                        headers: {
                            "User-Agent": UA,
                            "Referer": "".concat(SITE_BASE, "/"),
                            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                            "Accept-Language": "es-MX,es;q=0.9,en;q=0.8"
                        }
                    })];
                case 1:
                    resp = _b.sent();
                    if (!resp.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, resp.text()];
                case 2:
                    _a = _b.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = "";
                    _b.label = 4;
                case 4:
                    html = _a;
                    return [2 /*return*/, { ok: resp.ok, status: resp.status, html: html }];
            }
        });
    });
}
// Prueba el slug de cada título y devuelve el primer capítulo que exista.
function fetchEpisodePage(titles, season, episode) {
    return __awaiter(this, void 0, void 0, function () {
        var slugs, _i, titles_1, t, sl, tried, pages;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    slugs = [];
                    for (_i = 0, titles_1 = titles; _i < titles_1.length; _i++) {
                        t = titles_1[_i];
                        sl = slugify(t);
                        if (sl && slugs.indexOf(sl) === -1)
                            slugs.push(sl);
                    }
                    tried = [];
                    return [4 /*yield*/, Promise.all(slugs.slice(0, 4).map(function (slug) { return __awaiter(_this, void 0, void 0, function () {
                            var url, r, hasServers, e_1;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        _a.trys.push([0, 2, , 3]);
                                        url = "".concat(SITE_BASE, "/ver/").concat(slug, "/temporada-").concat(season, "/capitulo-").concat(episode, ".html");
                                        return [4 /*yield*/, fetchHtml(url)];
                                    case 1:
                                        r = _a.sent();
                                        hasServers = r.ok && (r.html.indexOf("/player/") !== -1 || r.html.indexOf("/external/") !== -1);
                                        tried.push("".concat(slug, ": HTTP ").concat(r.status).concat(r.ok && !hasServers ? " sin servidores" : ""));
                                        return [2 /*return*/, hasServers ? { slug: slug, html: r.html } : null];
                                    case 2:
                                        e_1 = _a.sent();
                                        tried.push("".concat(slug, ": ").concat(e_1.message));
                                        return [2 /*return*/, null];
                                    case 3: return [2 /*return*/];
                                }
                            });
                        }); }))];
                case 1:
                    pages = _a.sent();
                    return [2 /*return*/, { page: pages.find(function (p) { return p; }) || null, tried: tried }];
            }
        });
    });
}
function lastMatch(re, text) {
    var last = null;
    var m;
    while ((m = re.exec(text)) !== null)
        last = m;
    return last;
}
// Cada servidor "VER ONLINE" tiene un enlace /player/<código> (y /external/<código>).
// El idioma y la calidad aparecen justo antes (imagen language/<idioma>.png y "720p").
// Si no hay enlaces /player/, se usan los /external/ y se descartan después los que
// no lleven a un servidor soportado (las descargas).
function collectCodes(html, kind) {
    var re = new RegExp("/" + kind + "/([A-Za-z0-9]+)", "g");
    var servers = [];
    var seen = {};
    var prevIndex = 0;
    var m;
    while ((m = re.exec(html)) !== null) {
        var code = m[1];
        if (seen[code])
            continue;
        seen[code] = true;
        var chunk = html.slice(Math.max(prevIndex, m.index - 1500), m.index);
        var lang = lastMatch(/language\/([a-z]+)\.(?:png|webp|svg|jpg)/gi, chunk);
        var quality = lastMatch(/(\d{3,4})p/g, chunk);
        servers.push({
            code: code,
            lang: lang ? lang[1].toLowerCase() : "lat",
            quality: quality ? "".concat(quality[1], "p") : "HD"
        });
        prevIndex = m.index;
    }
    return servers;
}
function parseServers(html) {
    var online = collectCodes(html, "player");
    return online.length > 0 ? online : collectCodes(html, "external");
}
// /external/<código> es la pantalla de "Preparando enlace…"; su botón apunta al embed real.
function resolveExternal(code) {
    return __awaiter(this, void 0, void 0, function () {
        var r, html, vidara, ownHost, re, m;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fetchHtml("".concat(SITE_BASE, "/external/").concat(code))];
                case 1:
                    r = _a.sent();
                    if (!r.ok)
                        return [2 /*return*/, null];
                    html = r.html;
                    vidara = html.match(/https?:\/\/[a-z0-9.-]*vidara[a-z0-9.-]*\/e\/[A-Za-z0-9_-]+/i);
                    if (vidara)
                        return [2 /*return*/, vidara[0]];
                    ownHost = getHost(SITE_BASE).replace(/^www\./, "");
                    re = /href=["'](https?:\/\/[^"']+)["']/gi;
                    while ((m = re.exec(html)) !== null) {
                        if (getHost(m[1]).indexOf(ownHost) === -1)
                            return [2 /*return*/, m[1]];
                    }
                    return [2 /*return*/, null];
            }
        });
    });
}
function detectSource(url) {
    var host = getHost(url);
    if (host.indexOf("vidara") !== -1)
        return "Vidara";
    return null;
}
// ─────────────────────────────────────────────
// Extractores
// ─────────────────────────────────────────────
/**
 * Vidara (https://vidaraa.cc/e/<filecode>)
 * POST /api/stream {filecode, device} -> { streaming_url, subtitles, ... }
 * El token del HLS va atado a la IP, así que se pide siempre en el momento.
 */
function extractVidara(embedUrl) {
    return __awaiter(this, void 0, void 0, function () {
        var origin, filecode, resp, data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    origin = getOrigin(embedUrl);
                    filecode = embedUrl.split(/[?#]/)[0].split("/").filter(Boolean).pop();
                    if (!origin || !filecode)
                        throw Error("Vidara: URL de embed inválida");
                    return [4 /*yield*/, fetch("".concat(origin, "/api/stream"), {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "User-Agent": UA,
                                "Referer": embedUrl,
                                "Origin": origin
                            },
                            body: JSON.stringify({ filecode: filecode, device: "web" })
                        })];
                case 1:
                    resp = _a.sent();
                    if (!resp.ok)
                        throw Error("HTTP error! Status: ".concat(resp.status));
                    return [4 /*yield*/, resp.json()];
                case 2:
                    data = _a.sent();
                    if (!data.streaming_url)
                        throw Error("Vidara: la API no devolvió streaming_url");
                    console.log("[Vidara] HLS: ".concat(data.streaming_url));
                    return [2 /*return*/, {
                            url: data.streaming_url,
                            headers: { "Referer": "".concat(origin, "/"), "User-Agent": UA },
                            type: "hls"
                        }];
            }
        });
    });
}
var ALL_SOURCES = {
    Vidara: { label: "Vidara", format: "HLS", extract: extractVidara }
};
var SOURCE_EXTRACTORS = {};
for (var _i = 0, _a = Object.entries(ALL_SOURCES); _i < _a.length; _i++) {
    var _b = _a[_i], key = _b[0], source = _b[1];
    if (ENABLED_SOURCES[key])
        SOURCE_EXTRACTORS[key] = source;
}
// ─────────────────────────────────────────────
// Etiquetas
// ─────────────────────────────────────────────
function getLangLabel(lang) {
    var l = String(lang || "").toLowerCase();
    if (l === "lat" || l === "latino" || l === "")
        return "🇲🇽 LATINO";
    if (l === "esp" || l === "es" || l === "cast" || l === "cas")
        return "🇪🇸 CASTELLANO";
    if (l === "sub" || l === "en" || l === "jp")
        return "🌐 SUBTITULADO";
    return "\uD83C\uDF10 ".concat(l.toUpperCase());
}
// ─────────────────────────────────────────────
// Entry point — contrato Nuvio
// ─────────────────────────────────────────────
/**
 * @param {string|number} tmdbId
 * @param {string} type - "movie" | "tv" (por ahora solo "tv")
 * @param {string|number} [season]
 * @param {string|number} [episode]
 * @returns {Promise<Array>}
 */
exports.getStreams = function (tmdbId, type, season, episode) {
    return __awaiter(this, void 0, void 0, function () {
        var seasonNum, episodeNum, fail, titles, _a, page, tried, servers, errors_1, results, final, e_2;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!tmdbId || type !== "tv")
                        return [2 /*return*/, []];
                    seasonNum = season ? Number(season) : 1;
                    episodeNum = episode !== undefined && episode !== null ? Number(episode) : 1;
                    console.log("[".concat(PROVIDER_NAME, "] Buscando: TMDB ").concat(tmdbId, " S").concat(seasonNum, "E").concat(episodeNum));
                    fail = function (reason) {
                        console.warn("[".concat(PROVIDER_NAME, "] ").concat(reason));
                        return DEBUG
                            ? [{ name: PROVIDER_NAME, title: "", url: "https://example.invalid/debug", quality: "\u26A0 ".concat(reason) }]
                            : [];
                    };
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 5, , 6]);
                    return [4 /*yield*/, getTMDBTitles(tmdbId)];
                case 2:
                    titles = _b.sent();
                    if (titles.length === 0)
                        return [2 /*return*/, fail("TMDB no devolvi\u00F3 t\u00EDtulo (id ".concat(tmdbId, ")"))];
                    return [4 /*yield*/, fetchEpisodePage(titles, seasonNum, episodeNum)];
                case 3:
                    _a = _b.sent(), page = _a.page, tried = _a.tried;
                    if (!page)
                        return [2 /*return*/, fail("Sin cap\u00EDtulo. Intentos: ".concat(tried.join(" | ") || "ninguno"))];
                    console.log("[".concat(PROVIDER_NAME, "] Cap\u00EDtulo encontrado: ").concat(page.slug));
                    servers = parseServers(page.html);
                    if (servers.length === 0)
                        return [2 /*return*/, fail("Cap\u00EDtulo ".concat(page.slug, " sin c\u00F3digos de servidor"))];
                    errors_1 = [];
                    return [4 /*yield*/, Promise.all(servers.map(function (server) { return __awaiter(_this, void 0, void 0, function () {
                            var embedUrl, sourceKey, source, resolved, e_3;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        _a.trys.push([0, 3, , 4]);
                                        return [4 /*yield*/, resolveExternal(server.code)];
                                    case 1:
                                        embedUrl = _a.sent();
                                        if (!embedUrl) {
                                            errors_1.push("".concat(server.code, ": sin enlace"));
                                            return [2 /*return*/, null];
                                        }
                                        sourceKey = detectSource(embedUrl);
                                        if (!sourceKey || !SOURCE_EXTRACTORS[sourceKey]) {
                                            errors_1.push("".concat(server.code, ": ").concat(getHost(embedUrl), " no soportado"));
                                            return [2 /*return*/, null];
                                        }
                                        source = SOURCE_EXTRACTORS[sourceKey];
                                        return [4 /*yield*/, source.extract(embedUrl)];
                                    case 2:
                                        resolved = _a.sent();
                                        return [2 /*return*/, __assign({ name: PROVIDER_NAME, title: "", url: resolved.url, quality: "\uD83D\uDCFA ".concat(source.label, " (").concat(source.format, ")\n").concat(server.quality, " | WEB-DL\n").concat(getLangLabel(server.lang)), headers: resolved.headers }, (resolved.type ? { type: resolved.type } : {}))];
                                    case 3:
                                        e_3 = _a.sent();
                                        errors_1.push("".concat(server.code, ": ").concat(e_3.message));
                                        console.warn("[".concat(PROVIDER_NAME, "] Fall\u00F3 un servidor: ").concat(e_3.message));
                                        return [2 /*return*/, null];
                                    case 4: return [2 /*return*/];
                                }
                            });
                        }); }))];
                case 4:
                    results = _b.sent();
                    final = results.filter(Boolean);
                    if (final.length === 0)
                        return [2 /*return*/, fail("Sin streams. ".concat(errors_1.join(" | ")))];
                    console.log("[".concat(PROVIDER_NAME, "] \u2713 ").concat(final.length, " streams devueltos"));
                    return [2 /*return*/, final];
                case 5:
                    e_2 = _b.sent();
                    return [2 /*return*/, fail("Error: ".concat(e_2.message))];
                case 6: return [2 /*return*/];
            }
        });
    });
};
