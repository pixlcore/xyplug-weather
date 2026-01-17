<p align="center"><img src="https://raw.githubusercontent.com/pixlcore/xyplug-weather/refs/heads/main/logo.png" height="108" alt="Weather"/></p>
<h1 align="center">Weather Forecast</h1>

A simple weather plugin for the [xyOps Workflow Automation System](https://xyops.io). It fetches current conditions and forecasts from the free [Open-Meteo](https://open-meteo.com) API, enhances the response with summary text plus separate emoji fields, and returns structured JSON in the job output `data` payload.

## Requirements

- npx
- git

## Data Collection

- This plugin does not collect or store user data.
- Open-Meteo may log requests per their own policies.

## Parameters

Either `postal_code` or `latitude`/`longitude` is required.

- `postal_code`: Postal/ZIP code.
- `latitude`: Decimal latitude.
- `longitude`: Decimal longitude.
- `temperature_unit`: `fahrenheit` or `celsius`.
- `windspeed_unit`: `mph`, `kmh`, `ms`, or `kn`.
- `precipitation_unit`: `inch` or `mm`.
- `timezone`: Any valid IANA timezone (e.g. `America/Los_Angeles`) or `auto`.
- `air_quality`: Enable fetching current air quality data (defaults to true).
- `forecast_days`: Number of days to return (defaults to 7).
- `forecast_hours`: Number of hourly entries to return (defaults to 24).
- `timeout_ms`: Request timeout in milliseconds.

Postal code lookups are cached in the OS temp directory to avoid repeated geocoding calls.

## Output

The plugin returns:

- `location`: Latitude, longitude, timezone, elevation.
- `current`: Current weather plus `summary` and `emoji` fields.
- `daily`: Daily arrays plus per-day summary lines and per-day emoji.
- `hourly`: Hourly arrays (next `forecast_hours`) plus per-hour summary lines and per-hour emoji.
- `air_quality`: Current air quality data (only when enabled).
- `units`: Units returned by Open-Meteo.

Example (some fields omitted for display purposes):

```json
{
	"location": {
		"latitude": 34.052235,
		"longitude": -118.243683,
		"timezone": "America/Los_Angeles",
		"elevation": 47
	},
	"current": {
		"time": "2026-01-11T19:30",
		"interval": 900,
		"temperature": 47.1,
		"windspeed": 4.8,
		"winddirection": 22,
		"is_day": 0,
		"weathercode": 0,
		"summary": "Clear skies, 47.1 °F, Wind 4.8 mp/h, Air Quality AQI 25 (Fair), Humidity 84%",
		"emoji": "☀️",
		"humidity": 84,
		"aqi": 25
	},
	"daily": {
		"summaries": [
			{
				"date": "2026-01-11",
				"label": "Sun, Jan 11",
				"emoji": "☁️",
				"description": "Overcast",
				"line": "Sun, Jan 11: Overcast, High 57.1 °F, Low 41.6 °F, Wind 8.5 mp/h"
			},
			{
				"date": "2026-01-12",
				"label": "Mon, Jan 12",
				"emoji": "☁️",
				"description": "Overcast",
				"line": "Mon, Jan 12: Overcast, High 55.1 °F, Low 47 °F, Wind 6.3 mp/h"
			},
			{
				"date": "2026-01-13",
				"label": "Tue, Jan 13",
				"emoji": "🌫️",
				"description": "Fog",
				"line": "Tue, Jan 13: Fog, High 61.1 °F, Low 44.8 °F, Wind 4.9 mp/h"
			},
			{
				"date": "2026-01-14",
				"label": "Wed, Jan 14",
				"emoji": "☀️",
				"description": "Clear skies",
				"line": "Wed, Jan 14: Clear skies, High 68.4 °F, Low 45.7 °F, Wind 4.7 mp/h"
			},
			{
				"date": "2026-01-15",
				"label": "Thu, Jan 15",
				"emoji": "☀️",
				"description": "Clear skies",
				"line": "Thu, Jan 15: Clear skies, High 71.8 °F, Low 49.8 °F, Wind 4.5 mp/h"
			},
			{
				"date": "2026-01-16",
				"label": "Fri, Jan 16",
				"emoji": "☀️",
				"description": "Clear skies",
				"line": "Fri, Jan 16: Clear skies, High 72.5 °F, Low 46.7 °F, Wind 5.7 mp/h"
			},
			{
				"date": "2026-01-17",
				"label": "Sat, Jan 17",
				"emoji": "☁️",
				"description": "Overcast",
				"line": "Sat, Jan 17: Overcast, High 71.7 °F, Low 47 °F, Wind 5 mp/h"
			}
		]
	},
	"hourly": {
		"summaries": [
			{
				"time": "2026-01-11T19:00",
				"label": "Sun, Jan 11, 7 PM",
				"emoji": "☀️",
				"description": "Clear skies",
				"line": "Sun, Jan 11, 7 PM: Clear skies, 47.4 °F, Wind 4.3 mp/h, Humidity 84%"
			},
			{
				"time": "2026-01-11T20:00",
				"label": "Sun, Jan 11, 8 PM",
				"emoji": "☀️",
				"description": "Clear skies",
				"line": "Sun, Jan 11, 8 PM: Clear skies, 46.9 °F, Wind 5.2 mp/h, Humidity 84%"
			},
			{
				"time": "2026-01-11T21:00",
				"label": "Sun, Jan 11, 9 PM",
				"emoji": "☀️",
				"description": "Clear skies",
				"line": "Sun, Jan 11, 9 PM: Clear skies, 46.7 °F, Wind 5.5 mp/h, Humidity 84%"
			},
			{
				"time": "2026-01-11T22:00",
				"label": "Sun, Jan 11, 10 PM",
				"emoji": "🌥️",
				"description": "Mostly cloudy",
				"line": "Sun, Jan 11, 10 PM: Mostly cloudy, 47.2 °F, Wind 5.7 mp/h, Humidity 88%"
			},
			{
				"time": "2026-01-11T23:00",
				"label": "Sun, Jan 11, 11 PM",
				"emoji": "🌤️",
				"description": "Mostly clear",
				"line": "Sun, Jan 11, 11 PM: Mostly clear, 47.2 °F, Wind 5.6 mp/h, Humidity 86%"
			},
			{
				"time": "2026-01-12T00:00",
				"label": "Mon, Jan 12, 12 AM",
				"emoji": "🌤️",
				"description": "Mostly clear",
				"line": "Mon, Jan 12, 12 AM: Mostly clear, 47 °F, Wind 5.8 mp/h, Humidity 86%"
			},
			{
				"time": "2026-01-12T01:00",
				"label": "Mon, Jan 12, 1 AM",
				"emoji": "🌥️",
				"description": "Mostly cloudy",
				"line": "Mon, Jan 12, 1 AM: Mostly cloudy, 47.7 °F, Wind 5.7 mp/h, Humidity 87%"
			},
			{
				"time": "2026-01-12T02:00",
				"label": "Mon, Jan 12, 2 AM",
				"emoji": "☁️",
				"description": "Overcast",
				"line": "Mon, Jan 12, 2 AM: Overcast, 48.7 °F, Wind 6 mp/h, Humidity 89%"
			},
			{
				"time": "2026-01-12T03:00",
				"label": "Mon, Jan 12, 3 AM",
				"emoji": "🌥️",
				"description": "Mostly cloudy",
				"line": "Mon, Jan 12, 3 AM: Mostly cloudy, 49.1 °F, Wind 6 mp/h, Humidity 89%"
			},
			{
				"time": "2026-01-12T04:00",
				"label": "Mon, Jan 12, 4 AM",
				"emoji": "🌥️",
				"description": "Mostly cloudy",
				"line": "Mon, Jan 12, 4 AM: Mostly cloudy, 48.8 °F, Wind 6.3 mp/h, Humidity 89%"
			},
			{
				"time": "2026-01-12T05:00",
				"label": "Mon, Jan 12, 5 AM",
				"emoji": "🌥️",
				"description": "Mostly cloudy",
				"line": "Mon, Jan 12, 5 AM: Mostly cloudy, 48.7 °F, Wind 5.2 mp/h, Humidity 89%"
			},
			{
				"time": "2026-01-12T06:00",
				"label": "Mon, Jan 12, 6 AM",
				"emoji": "☁️",
				"description": "Overcast",
				"line": "Mon, Jan 12, 6 AM: Overcast, 48 °F, Wind 4.5 mp/h, Humidity 89%"
			}
		]
	}
}
```

## Free Tier Limits

The Open-Meteo free tier is for **non-commercial use only**. The current API limits are:

- 600 calls / minute
- 5,000 calls / hour
- 10,000 calls / day
- 300,000 calls / month

Please note that this Plugin makes up to 3 API calls per run, because it may need to geocode a postal code, fetch the weather data, and then fetch the air quality data (optional).  So when evaluating limits, please adjust accordingly.

If you have a commercial account, see "Commercial Plans" below for API Key usage.

## Local Testing

Use this sample JSON to run the plugin locally:

```json
{
	"xy": 1,
	"params": {
		"latitude": 34.052235,
		"longitude": -118.243683
	}
}
```

Or, use a postal code instead of latitude/longitude (requires an additional API call to geolocate):

```json
{
	"xy": 1,
	"params": {
		"postal_code": "95437"
	}
}
```

Pipe it into the plugin:

```sh
cat sample.json | node index.js
```

Or, without a file:

```sh
echo '{ "xy":1, "params": { "latitude":34.052235, "longitude":-118.243683 } }' | node index.js
```

## Commercial Plan

Open-Meteo offers commercial plans with higher rate limits and other features.  If you sign up for this, make sure to include your API Key as an environment variable named:

```
METEO_API_KEY
```

In xyOps, store this in a Secret Vault and map it to the `METEO_API_KEY` environment variable for the plugin.

## License

MIT
