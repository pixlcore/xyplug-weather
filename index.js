#!/usr/bin/env node

// xyplug-weather: Open-Meteo weather fetcher for xyOps
// MIT License

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Default daily fields pulled from Open-Meteo.
const DEFAULT_DAILY = [
	"temperature_2m_max",
	"temperature_2m_min",
	"rain_sum",
	"showers_sum",
	"snowfall_sum",
	"precipitation_hours",
	"weathercode",
	"windspeed_10m_max",
	"winddirection_10m_dominant",
	"shortwave_radiation_sum"
];

// Default hourly fields pulled from Open-Meteo.
const DEFAULT_HOURLY = [
	"temperature_2m",
	"relativehumidity_2m",
	"precipitation",
	"weathercode",
	"windspeed_10m",
	"winddirection_10m"
];

// Default air quality fields pulled from Open-Meteo.
const DEFAULT_AIR_QUALITY_HOURLY = [
	"pm10",
	"pm2_5",
	"carbon_monoxide",
	"nitrogen_dioxide",
	"sulphur_dioxide",
	"ozone",
	"uv_index",
	"uv_index_clear_sky",
	"european_aqi"
];

// Unit mappings for nice output labels.
const TEMP_UNITS = {
	fahrenheit: "F",
	celsius: "C"
};

const WIND_UNITS = {
	mph: "mph",
	kmh: "km/h",
	ms: "m/s",
	kn: "kn"
};

const PRECIP_UNITS = {
	inch: "in",
	mm: "mm"
};

// Emit a final XYWP response and exit.
function writeExit(payload) {
	process.stdout.write(`${JSON.stringify(payload)}\n`, () => process.exit(0));
}

// Emit an error response and exit.
function fail(code, description) {
	return writeExit({ xy: 1, code, description });
}

// Read and parse the job payload from STDIN.
async function readJob() {
	const chunks = [];
	for await (const chunk of process.stdin) chunks.push(chunk);
	const raw = chunks.join("").trim();
	if (!raw) return fail("input", "No JSON input received on STDIN.");
	try {
		return JSON.parse(raw);
	}
	catch (err) {
		return fail("input", `Failed to parse JSON input: ${err.message}`);
	}
}

// Parse a numeric parameter safely, with a fallback.
function parseNumber(value, fallback) {
	if (value === undefined || value === null || value === "") return fallback;
	const num = Number(value);
	return Number.isFinite(num) ? num : fallback;
}

// Parse a loosely-typed boolean parameter with a fallback.
function parseBoolean(value, fallback) {
	if (value === undefined || value === null || value === "") return fallback;
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	const text = String(value).trim().toLowerCase();
	if (text === "true" || text === "yes" || text === "1") return true;
	if (text === "false" || text === "no" || text === "0") return false;
	return fallback;
}

// Normalize a comma-delimited list to an array (preserving intentional empty lists).
function normalizeList(value, fallbackList) {
	if (value === undefined || value === null) {
		return Array.isArray(fallbackList) ? fallbackList.slice() : [];
	}

	let list = [];
	if (Array.isArray(value)) {
		list = value.map(String);
	}
	else if (typeof value === "string") {
		list = value.split(",").map((entry) => entry.trim()).filter(Boolean);
	}
	else {
		list = [String(value).trim()].filter(Boolean);
	}

	return list;
}

// Upper-case first letter of a string.
function ucFirst(text) {
	if (!text) return "";
	return text.charAt(0).toUpperCase() + text.slice(1);
}

// Map Open-Meteo weather codes to emoji + summary text.
function getWeatherSummary(code) {
	let emoji = "";
	let summary = "";

	switch (code) {
		case 0: emoji = "☀️"; summary = "clear skies"; break;
		case 1: emoji = "🌤️"; summary = "mostly clear"; break;
		case 2: emoji = "🌥️"; summary = "mostly cloudy"; break;
		case 3: emoji = "☁️"; summary = "overcast"; break;
		case 45: emoji = "🌫️"; summary = "fog"; break;
		case 48: emoji = "🌫️"; summary = "depositing rime fog"; break;
		case 51: emoji = "🌦️"; summary = "light drizzle"; break;
		case 53: emoji = "🌦️"; summary = "moderate drizzle"; break;
		case 55: emoji = "🌧️"; summary = "dense drizzle"; break;
		case 56: emoji = "🌨️"; summary = "light freezing drizzle"; break;
		case 57: emoji = "🌨️"; summary = "dense freezing drizzle"; break;
		case 61: emoji = "🌧️"; summary = "slight rain"; break;
		case 63: emoji = "🌧️"; summary = "moderate rain"; break;
		case 65: emoji = "🌧️"; summary = "heavy rain"; break;
		case 66: emoji = "🌨️"; summary = "light freezing rain"; break;
		case 67: emoji = "🌨️"; summary = "heavy freezing rain"; break;
		case 71: emoji = "🌨️"; summary = "light snow fall"; break;
		case 73: emoji = "🌨️"; summary = "moderate snow fall"; break;
		case 75: emoji = "❄️"; summary = "heavy snow fall"; break;
		case 77: emoji = "❄️"; summary = "snow grains"; break;
		case 80: emoji = "🌦️"; summary = "light rain showers"; break;
		case 81: emoji = "🌧️"; summary = "moderate rain showers"; break;
		case 82: emoji = "🌧️"; summary = "violent rain showers"; break;
		case 85: emoji = "🌨️"; summary = "light snow showers"; break;
		case 86: emoji = "🌨️"; summary = "heavy snow showers"; break;
		case 95: emoji = "⛈️"; summary = "thunderstorm"; break;
		case 96: emoji = "⛈️"; summary = "thunderstorm with light hail"; break;
		case 99: emoji = "⛈️"; summary = "thunderstorm with heavy hail"; break;
		default: emoji = "🌪️"; summary = "unknown conditions"; break;
	}

	const description = ucFirst(summary);
	return {
		emoji,
		description,
		text: description
	};
}

// Format a date string to a short weekday label in the desired timezone.
function formatDayLabel(dateStr, timezone) {
	if (!dateStr) return "";
	const safeZone = timezone && timezone !== "auto" ? timezone : "UTC";
	try {
		const date = new Date(`${dateStr}T00:00:00`);
		const formatter = new Intl.DateTimeFormat(undefined, {
			weekday: "short",
			month: "short",
			day: "numeric",
			timeZone: safeZone
		});
		const label = formatter.format(date);
		if (label && label !== "Invalid Date") {
			return label;
		}
	}
	catch (err) {
		// Ignore date parsing failures.
	}
	return dateStr;
}

// Format an hourly date/time label in the desired timezone.
function formatHourLabel(dateStr, timezone) {
	if (!dateStr) return "";
	const safeZone = timezone && timezone !== "auto" ? timezone : "UTC";
	try {
		const date = new Date(dateStr);
		const formatter = new Intl.DateTimeFormat(undefined, {
			weekday: "short",
			month: "short",
			day: "numeric",
			hour: "numeric",
			timeZone: safeZone
		});
		const label = formatter.format(date);
		if (label && label !== "Invalid Date") {
			return label;
		}
	}
	catch (err) {
		// Ignore date parsing failures.
	}
	return dateStr;
}

// Convert a unit parameter into a friendly label for summaries.
function buildUnitLabel(paramValue, map) {
	if (!paramValue) return "";
	const key = String(paramValue).trim().toLowerCase();
	return map[key] || paramValue;
}

// Pick a unit label, preferring API-provided units when available.
function pickUnit(candidate, fallback) {
	if (candidate !== undefined && candidate !== null && candidate !== "") return candidate;
	return fallback;
}

// Build a summary line for current conditions.
function buildCurrentSummary(data, params) {
	if (!data || !data.current_weather) return null;
	const current = data.current_weather;
	const units = data.current_weather_units || {};
	const summary = getWeatherSummary(current.weathercode);

	const tempUnit = pickUnit(units.temperature, buildUnitLabel(params.temperature_unit, TEMP_UNITS));
	const windUnit = pickUnit(units.windspeed, buildUnitLabel(params.windspeed_unit, WIND_UNITS));

	let line = summary.text;
	if (current.temperature !== undefined) {
		line += `, ${current.temperature}${tempUnit ? ` ${tempUnit}` : ""}`;
	}
	if (current.windspeed !== undefined) {
		line += `, Wind ${current.windspeed}${windUnit ? ` ${windUnit}` : ""}`;
	}

	return {
		...summary,
		line
	};
}

// Extract the current humidity from the hourly payload, if available.
function getCurrentHumidity(data) {
	if (!data || !data.hourly || !Array.isArray(data.hourly.relativehumidity_2m)) return undefined;
	return data.hourly.relativehumidity_2m[0];
}

// Build per-day summary lines for the daily forecast.
function buildDailySummaries(data, params) {
	if (!data || !data.daily || !Array.isArray(data.daily.time)) return [];

	const daily = data.daily;
	const units = data.daily_units || {};
	const timezone = params.timezone || data.timezone || "auto";
	const tempUnit = pickUnit(units.temperature_2m_max, buildUnitLabel(params.temperature_unit, TEMP_UNITS));
	const precipUnit = pickUnit(units.rain_sum, buildUnitLabel(params.precipitation_unit, PRECIP_UNITS));
	const windUnit = pickUnit(units.windspeed_10m_max, buildUnitLabel(params.windspeed_unit, WIND_UNITS));

	const summaries = [];
	for (let idx = 0; idx < daily.time.length; idx++) {
		const dateStr = daily.time[idx];
		const label = formatDayLabel(dateStr, timezone);
		const code = daily.weathercode ? daily.weathercode[idx] : null;
		const summary = code === null || code === undefined ? {
			emoji: "❓",
			description: "Unknown conditions",
			text: "Unknown conditions"
		} : getWeatherSummary(code);

		let line = `${label}: ${summary.description}`;

		if (daily.temperature_2m_max && daily.temperature_2m_max[idx] !== undefined) {
			line += `, High ${daily.temperature_2m_max[idx]}${tempUnit ? ` ${tempUnit}` : ""}`;
		}
		if (daily.temperature_2m_min && daily.temperature_2m_min[idx] !== undefined) {
			line += `, Low ${daily.temperature_2m_min[idx]}${tempUnit ? ` ${tempUnit}` : ""}`;
		}

		if (daily.snowfall_sum && daily.snowfall_sum[idx] > 0) {
			line += `, Snow ${daily.snowfall_sum[idx]}${precipUnit ? ` ${precipUnit}` : ""}`;
		}
		else if (daily.showers_sum && daily.showers_sum[idx] > 0) {
			line += `, Showers ${daily.showers_sum[idx]}${precipUnit ? ` ${precipUnit}` : ""}`;
		}
		else if (daily.rain_sum && daily.rain_sum[idx] > 0) {
			line += `, Rain ${daily.rain_sum[idx]}${precipUnit ? ` ${precipUnit}` : ""}`;
		}

		if (daily.windspeed_10m_max && daily.windspeed_10m_max[idx] !== undefined) {
			line += `, Wind ${daily.windspeed_10m_max[idx]}${windUnit ? ` ${windUnit}` : ""}`;
		}

		summaries.push({
			date: dateStr,
			label,
			emoji: summary.emoji,
			description: summary.description,
			line
		});
	}

	return summaries;
}

// Build per-hour summary lines for the next N hours.
function buildHourlySummaries(data, params, limit) {
	if (!data || !data.hourly || !Array.isArray(data.hourly.time)) return [];

	const hourly = data.hourly;
	const units = data.hourly_units || {};
	const timezone = params.timezone || data.timezone || "auto";
	const tempUnit = pickUnit(units.temperature_2m, buildUnitLabel(params.temperature_unit, TEMP_UNITS));
	const precipUnit = pickUnit(units.precipitation, buildUnitLabel(params.precipitation_unit, PRECIP_UNITS));
	const windUnit = pickUnit(units.windspeed_10m, buildUnitLabel(params.windspeed_unit, WIND_UNITS));

	const summaries = [];
	const maxItems = Number.isFinite(limit) ? Math.max(0, Math.min(hourly.time.length, limit)) : hourly.time.length;
	for (let idx = 0; idx < maxItems; idx++) {
		const dateStr = hourly.time[idx];
		const label = formatHourLabel(dateStr, timezone);
		const code = hourly.weathercode ? hourly.weathercode[idx] : null;
		const summary = code === null || code === undefined ? {
			emoji: "❓",
			description: "Unknown conditions",
			text: "Unknown conditions"
		} : getWeatherSummary(code);

		let line = `${label}: ${summary.description}`;

		if (hourly.temperature_2m && hourly.temperature_2m[idx] !== undefined) {
			line += `, ${hourly.temperature_2m[idx]}${tempUnit ? ` ${tempUnit}` : ""}`;
		}
		if (hourly.precipitation && hourly.precipitation[idx] !== undefined && hourly.precipitation[idx] > 0) {
			line += `, Precip ${hourly.precipitation[idx]}${precipUnit ? ` ${precipUnit}` : ""}`;
		}
		if (hourly.windspeed_10m && hourly.windspeed_10m[idx] !== undefined) {
			line += `, Wind ${hourly.windspeed_10m[idx]}${windUnit ? ` ${windUnit}` : ""}`;
		}
		if (hourly.relativehumidity_2m && hourly.relativehumidity_2m[idx] !== undefined) {
			line += `, Humidity ${hourly.relativehumidity_2m[idx]}%`;
		}

		summaries.push({
			time: dateStr,
			label,
			emoji: summary.emoji,
			description: summary.description,
			line
		});
	}

	return summaries;
}

// Trim hourly arrays to a specific length for consistent output.
function trimHourlyData(hourly, limit) {
	if (!hourly || !Array.isArray(hourly.time)) return hourly;
	const trimmed = { ...hourly };
	Object.keys(trimmed).forEach((key) => {
		if (Array.isArray(trimmed[key])) {
			trimmed[key] = trimmed[key].slice(0, limit);
		}
	});
	return trimmed;
}

// Build a cache filename for postal code lookups.
function getPostalCachePath(postalCode) {
	const safe = String(postalCode).trim().replace(/[^\w.-]/g, "_");
	return path.join(os.tmpdir(), `${safe}.json`);
}

// Resolve coordinates from a postal code via Open-Meteo geocoding (cached).
async function resolvePostalCode(postalCode, timeoutMs, apiKey) {
	if (!postalCode) return null;
	const cachePath = getPostalCachePath(postalCode);

	try {
		const cachedRaw = fs.readFileSync(cachePath, "utf8");
		const cached = JSON.parse(cachedRaw);
		const hasCoords = cached && Number.isFinite(cached.latitude) && Number.isFinite(cached.longitude);
		const hasDetails = cached && (cached.name || cached.admin1 || cached.admin2 || cached.admin3 || cached.admin4);
		if (hasCoords && hasDetails) {
			return cached;
		}
	}
	catch (err) {
		// Ignore cache errors and fall back to live lookup.
	}

	const geoQuery = new URLSearchParams();
	geoQuery.set("name", String(postalCode).trim());
	geoQuery.set("count", "1");
	geoQuery.set("language", "en");
	geoQuery.set("format", "json");
	if (apiKey) geoQuery.set("apikey", apiKey);

	const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?${geoQuery.toString()}`;
	const geoData = await fetchJson(geoUrl, timeoutMs);
	if (!geoData || !Array.isArray(geoData.results) || !geoData.results.length) {
		return null;
	}

	const first = geoData.results[0];
	const latitude = Number(first.latitude);
	const longitude = Number(first.longitude);
	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
		return null;
	}

	const result = {
		...first,
		latitude,
		longitude
	};

	try {
		fs.writeFileSync(cachePath, JSON.stringify(result));
	}
	catch (err) {
		// Ignore cache write errors.
	}

	return result;
}

// Map European AQI to a simple label.
function classifyEuropeanAqi(value) {
	if (value === undefined || value === null || !Number.isFinite(value)) return null;
	if (value <= 20) return "Good";
	if (value <= 40) return "Fair";
	if (value <= 60) return "Moderate";
	if (value <= 80) return "Poor";
	if (value <= 100) return "Very Poor";
	return "Extremely Poor";
}

// Extract the first hourly air quality entry as "current".
function buildAirQualityCurrent(airQualityData) {
	if (!airQualityData || !airQualityData.hourly || !Array.isArray(airQualityData.hourly.time)) return null;
	if (!airQualityData.hourly.time.length) return null;

	const current = { time: airQualityData.hourly.time[0] };
	Object.keys(airQualityData.hourly).forEach((key) => {
		if (key === "time") return;
		const series = airQualityData.hourly[key];
		if (Array.isArray(series) && series.length) {
			current[key] = series[0];
		}
	});

	if (current.european_aqi !== undefined) {
		const label = classifyEuropeanAqi(Number(current.european_aqi));
		if (label) current.aqi_label = label;
	}

	return current;
}

// Fetch JSON from the given URL with a timeout.
async function fetchJson(apiUrl, timeoutMs) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs);
	try {
		const response = await fetch(apiUrl, { signal: controller.signal });
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		return await response.json();
	}
	finally {
		clearTimeout(timer);
	}
}

// Main execution flow: parse job, fetch API, build summaries, return data.
(async () => {
	const job = await readJob();
	const params = job.params || {};
	const timeoutMs = parseNumber(params.timeout_ms, 15000);
	const apiKey = process.env.METEO_API_KEY ? String(process.env.METEO_API_KEY).trim() : "";

	const postalCode = params.postal_code ? String(params.postal_code).trim() : "";
	let latitude = parseNumber(params.latitude, NaN);
	let longitude = parseNumber(params.longitude, NaN);

	let geoDetails = null;
	if (postalCode) {
		const geo = await resolvePostalCode(postalCode, timeoutMs, apiKey);
		if (!geo) {
			return fail("params", "Failed to resolve postal code to coordinates.");
		}
		latitude = geo.latitude;
		longitude = geo.longitude;
		geoDetails = geo;
	}

	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
		return fail("params", "Provide a postal code or a numeric latitude/longitude pair.");
	}

	// Allow spaces in the UI, but strip them out for the API.
	const dailyList = normalizeList(params.daily, DEFAULT_DAILY);
	const hourlyList = normalizeList(params.hourly, DEFAULT_HOURLY);
	const currentWeather = true;

	if (!dailyList.length && !hourlyList.length) {
		return fail("params", "No data blocks selected. Add daily and/or hourly fields.");
	}

	const temperatureUnit = String(params.temperature_unit || "fahrenheit").trim().toLowerCase();
	const windspeedUnit = String(params.windspeed_unit || "mph").trim().toLowerCase();
	const precipitationUnit = String(params.precipitation_unit || "inch").trim().toLowerCase();
	const timezone = String(params.timezone || "auto").trim();
	const forecastDays = parseNumber(params.forecast_days, 7);
	const forecastHours = parseNumber(params.forecast_hours, 24);
	const includeAirQuality = parseBoolean(params.air_quality, true);

	// Build Open-Meteo query string from user parameters.
	const query = new URLSearchParams();
	query.set("latitude", String(latitude));
	query.set("longitude", String(longitude));
	if (dailyList.length) query.set("daily", dailyList.join(","));
	if (hourlyList.length) query.set("hourly", hourlyList.join(","));
	query.set("current_weather", "true");
	if (temperatureUnit) query.set("temperature_unit", temperatureUnit);
	if (windspeedUnit) query.set("windspeed_unit", windspeedUnit);
	if (precipitationUnit) query.set("precipitation_unit", precipitationUnit);
	if (timezone) query.set("timezone", timezone);
	if (Number.isFinite(forecastDays)) query.set("forecast_days", String(forecastDays));
	if (Number.isFinite(forecastHours)) query.set("forecast_hours", String(forecastHours));
	if (apiKey) query.set("apikey", apiKey);

	const apiUrl = `https://api.open-meteo.com/v1/forecast?${query.toString()}`;

	// Fetch Open-Meteo data via native fetch.
	let data;
	try {
		data = await fetchJson(apiUrl, timeoutMs);
	}
	catch (err) {
		const message = err && err.name === "AbortError" ? "Request timed out." : `Request failed: ${err.message || err}`;
		return fail("http", message);
	}

	if (data && data.error) {
		return fail("api", data.reason || "Open-Meteo returned an error.");
	}

	// Fetch air quality data as a best-effort optional payload.
	let airQualityData = null;
	let airQualityError = null;
	if (includeAirQuality) {
		try {
			const airQuery = new URLSearchParams();
			airQuery.set("latitude", String(latitude));
			airQuery.set("longitude", String(longitude));
			airQuery.set("hourly", DEFAULT_AIR_QUALITY_HOURLY.join(","));
			airQuery.set("timezone", timezone || "auto");
			airQuery.set("forecast_hours", "1");
			if (apiKey) airQuery.set("apikey", apiKey);

			const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?${airQuery.toString()}`;
			airQualityData = await fetchJson(airUrl, timeoutMs);
			if (airQualityData && airQualityData.error) {
				airQualityError = airQualityData.reason || "Open-Meteo returned an air quality error.";
				airQualityData = null;
			}
		}
		catch (err) {
			airQualityError = err && err.name === "AbortError" ? "Air quality request timed out." : `Air quality request failed: ${err.message || err}`;
		}
	}

	// Enhance the API response with friendly summaries.
	const currentSummary = buildCurrentSummary(data, params);
	const dailySummaries = buildDailySummaries(data, params);
	const hourlySummaries = buildHourlySummaries(data, params, forecastHours);
	const airQualityCurrent = includeAirQuality ? buildAirQualityCurrent(airQualityData) : null;
	const currentHumidity = getCurrentHumidity(data);

	if (currentSummary && airQualityCurrent) {
		if (airQualityCurrent.european_aqi !== undefined) {
			const label = airQualityCurrent.aqi_label ? ` (${airQualityCurrent.aqi_label})` : "";
			currentSummary.line += `, Air Quality AQI ${airQualityCurrent.european_aqi}${label}`;
		}
		else if (airQualityCurrent.pm2_5 !== undefined) {
			currentSummary.line += `, Air Quality PM2.5 ${airQualityCurrent.pm2_5}`;
		}
	}

	if (currentSummary && currentHumidity !== undefined) {
		currentSummary.line += `, Humidity ${currentHumidity}%`;
	}

	// Assemble a human-friendly summary block.
	const summaryLines = [];
	if (currentSummary) summaryLines.push(currentSummary.line);

	// Prepare the final structured output for xyOps.
	const trimmedHourly = data.hourly ? trimHourlyData(data.hourly, forecastHours) : undefined;
	const output = {
		location: {
			latitude: data.latitude ?? latitude,
			longitude: data.longitude ?? longitude,
			timezone: data.timezone || timezone,
			elevation: data.elevation,
			postal_code: postalCode || undefined,
			name: geoDetails ? geoDetails.name : undefined,
			admin1: geoDetails ? geoDetails.admin1 : undefined,
			admin2: geoDetails ? geoDetails.admin2 : undefined,
			admin3: geoDetails ? geoDetails.admin3 : undefined,
			admin4: geoDetails ? geoDetails.admin4 : undefined
		},
		current: data.current_weather ? {
			...data.current_weather,
			summary: currentSummary ? currentSummary.line : undefined,
			emoji: currentSummary ? currentSummary.emoji : undefined,
			humidity: currentHumidity,
			aqi: airQualityCurrent ? airQualityCurrent.european_aqi : undefined
		} : undefined,
		daily: data.daily ? {
			...data.daily,
			summaries: dailySummaries
		} : undefined,
		hourly: trimmedHourly ? {
			...trimmedHourly,
			summaries: hourlySummaries
		} : undefined,
		air_quality: includeAirQuality ? (airQualityCurrent ? {
			current: airQualityCurrent,
			units: airQualityData && airQualityData.hourly_units ? airQualityData.hourly_units : undefined
		} : (airQualityError ? { error: airQualityError } : undefined)) : undefined,
		units: {
			current: data.current_weather_units || undefined,
			daily: data.daily_units || undefined,
			hourly: data.hourly_units || undefined
		}
	};

	writeExit({ xy: 1, code: 0, data: output });
})();
