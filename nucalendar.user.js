// ==UserScript==
// @name           NUCalendar
// @author         James Ross-Gowan
// @namespace      rossy2401.github.io
// @version        0.9.0
// @include        https://myhub.newcastle.edu.au/*
// ==/UserScript==

/* To the extent possible under law, the author(s) have dedicated all copyright
   and related and neighboring rights to this software to the public domain
   worldwide. This software is distributed without any warranty. See
   <http://creativecommons.org/publicdomain/zero/1.0/> for a copy of the CC0
   Public Domain Dedication, which applies to this software. */

(function() {
	"use strict";

	var holidays = [
		new Date(2014, 3, 18), // Easter
		new Date(2014, 5,  9), // Queen's birthday
		new Date(2014, 9,  6), // Labour day
	];

	// icsSplit - Split long lines with CRLFs
	function icsSplit(str) {
		str = ""+str;

		// iCalendar files should not have lines more than 75 bytes (or 75
		// UTF-8 code units) long. I'm not sure if long lines actually cause
		// problems with anything, but it's probably best to split them anyway.

		if (!icsSplit.regex)
			// Create a regex that splits URL-encoded UTF-8 on code point
			// boundaries. This is actually pretty easy to do, since the
			// different classes of UTF-8 code units start with different hex
			// digits.
			icsSplit.regex = new RegExp(
					// Single byte control characters
					/%[0-7][\da-fA-F]/.source + "|" +
					// Two byte characters
					/%[cdCD][\da-fA-F]%[89abAB][\da-fA-F]/.source + "|" +
					// Three byte characters
					/%[eE][\da-fA-F]%[89abAB][\da-fA-F]%[89abAB][\da-fA-F]/.source + "|" +
					// Four byte characters
					/%[fF][\da-fA-F]%[89abAB][\da-fA-F]%[89abAB][\da-fA-F]%[89abAB][\da-fA-F]/.source + "|" +
					// Single byte printable ASCII
					/[\s\S]/.source
				, "g");

		var length = 0, max = 75, utf = "";

		// Convert to URL-encoded UTF-8
		try {
			utf = encodeURIComponent(str);
		} catch (e) {
			if (e instanceof URIError)
				throw new Error("Invalid Unicode in string");
			throw e;
		}

		// Insert newlines in all lines longer than 75 UTF-8 code units, then
		// convert the URL-encoded string back to standard JavaScript UTF-16
		return decodeURIComponent(utf.replace(icsSplit.regex, function(m) {
			var units = 1;

			switch (m.length) {
				case  3: units = 1; break;
				case  6: units = 2; break;
				case  9: units = 3; break;
				case 12: units = 4; break;
			}

			if (length + units > max) {
				length = units;
				max = 74;
				// Continuation lines start with one character of vertical
				// whitespace
				return "\r\n\t" + m;
			}

			length += units;
			return m;
		}));
	}

	// icsDay - Format day of week in iCalendar format
	function icsDay(date) {
		date = new Date(date);

		return ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][date.getDay()];
	}

	// icsLocalDate - Format an iCalendar date string in local time
	function icsLocalDate(date) {
		date = new Date(date);

		return (date.getYear() + 1900) +
		       ("0" + (date.getMonth() + 1)).substr(-2) +
		       ("0" + date.getDate()).substr(-2) +
		       "T" +
		       ("0" + date.getHours()).substr(-2) +
		       ("0" + date.getMinutes()).substr(-2) +
		       ("0" + date.getSeconds()).substr(-2);
	}

	// icsDate - Format an iCalendar date string in UTC
	function icsDate(date) {
		date = new Date(date);

		return date.getUTCFullYear() +
		       ("0" + (date.getUTCMonth() + 1)).substr(-2) +
		       ("0" + date.getUTCDate()).substr(-2) +
		       "T" +
		       ("0" + date.getUTCHours()).substr(-2) +
		       ("0" + date.getUTCMinutes()).substr(-2) +
		       ("0" + date.getUTCSeconds()).substr(-2) +
		       "Z";
	}

	// icsEscape - Escape a string for use in iCalendar files
	function icsEscape(str) {
		str = ""+str;

		return str.replace(/[\\;,\n]/g, function(c) {
			return ({
				"\\": "\\\\",
				";": "\\;",
				",": "\\,",
				"\n": "\\n",
			})[c] || c;
		})
	}

	// icsTimezone - Generate embedded tz info for the calendar
	function icsTimezone(tz) {
		tz = ""+tz;

		return ({
			// This list is obviously incomplete
			"Australia/Sydney": [
				"BEGIN:VTIMEZONE",
				"TZID:Australia/Sydney",
				"X-LIC-LOCATION:Australia/Sydney",
				"BEGIN:STANDARD",
				"TZOFFSETFROM:+1100",
				"TZOFFSETTO:+1000",
				"TZNAME:EST",
				"DTSTART:19700405T030000",
				"RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU",
				"END:STANDARD",
				"BEGIN:DAYLIGHT",
				"TZOFFSETFROM:+1000",
				"TZOFFSETTO:+1100",
				"TZNAME:EST",
				"DTSTART:19701004T020000",
				"RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU",
				"END:DAYLIGHT",
				"END:VTIMEZONE",
			]
		})[tz] || [];
	}

	// icsWrite - Write an iCalendar file with the given events
	function icsWrite(events, name, tz) {
		tz = (tz||"Australia/Sydney")+"";
		tz = icsEscape(tz);

		name = (name||"Calendar")+"";
		name = icsEscape(name);

		if (!Array.isArray(events))
			throw new TypeError("events must be an array");

		var lines = [],
		    // iCalendar events must contain their creation time, presumably to
		    // distinguish them from older versions of the same event
		    createTime = icsDate(new Date());

		// writeLine - Write a line of data to the calendar, including the
		// title and attributes
		function writeLine(line) {
			lines.push(icsSplit(line));
		}

		writeLine("BEGIN:VCALENDAR");
		writeLine("PRODID:nucalendar.user.js");
		writeLine("VERSION:2.0");
		writeLine("CALSCALE:GREGORIAN");
		writeLine("X-WR-TIMEZONE:" + tz);
		writeLine("X-WR-CALNAME:" + name);

		// iCalendar files MUST have embedded tz info for the time zones that
		// it uses
		icsTimezone(tz).forEach(function(line) {
			writeLine(line);
		});

		events.forEach(function(evt) {
			writeLine("BEGIN:VEVENT");

			var start = new Date(evt.start),
			    end = new Date(evt.end);

			if (isNaN(start.getTime()))
				throw new TypeError("evt.start must be a valid date");

			if (isNaN(end.getTime()))
				throw new TypeError("evt.end must be a valid date");

			writeLine("UID:" + icsEscape(evt.uid || Math.random()));
			writeLine("DTSTAMP:" + createTime);
			writeLine("DTSTART;TZID=" + tz + ":" + icsLocalDate(start));
			writeLine("DTEND;TZID=" + tz + ":" + icsLocalDate(end));

			// Write event metadata
			writeLine("SUMMARY:" + icsEscape(evt.summary||""));
			writeLine("DESCRIPTION:" + icsEscape(evt.description||""));
			writeLine("LOCATION:" + icsEscape(evt.location||""));

			// If evt.until is set, this is a recurring event that repeats
			// until evt.until
			if (evt.until) {
				var until = new Date(evt.until);

				if (isNaN(until.getTime()))
					throw new TypeError("evt.until must be a valid date");

				writeLine("RRULE:FREQ=WEEKLY;UNTIL=" + icsDate(until) + ";BYDAY=" + icsDay(start));

				if (evt.except && evt.except.length != 0)
					writeLine("EXDATE:" + evt.except.map(icsDate).join(","));
			}

			writeLine("TRANSP:" + (evt.transparent ? "TRANSPARENT" : "OPAQUE"));
			writeLine("STATUS:" + (evt.status || "CONFIRMED"));

			writeLine("END:VEVENT");
		});

		writeLine("END:VCALENDAR");
		writeLine("");

		return "data:text/calendar," + encodeURI(lines.join("\r\n"));
	}

	// slice - Turn an array like object into an array
	function slice(arr) {
		return Array.prototype.slice.call(arr);
	}

	// parseCourse - Parse the table header text
	function parseCourse(str) {
		str = ""+str;

		var m = str.match(/^\s*(.*?)\s+-\s+(.*)\s*$/);

		return {
			code: m[1],
			name: m[2],
		};
	}

	// parseDateRange - Parse the Start/End Date column
	function parseDateRange(str) {
		str = ""+str;

		var m = str.match(/^\s*(\d\d)\/(\d\d)\/(\d{4})\s*-\s*(\d\d)\/(\d\d)\/(\d{4})\s*$/)

		return {
			start: new Date(parseInt(m[3]),  parseInt(m[2]) - 1, parseInt(m[1])),
			end: new Date(parseInt(m[6]), parseInt(m[5]) - 1, parseInt(m[4]) + 1),
		};
	}

	// parseDateRange - Parse the Days & Times column
	function parseTimeRange(str) {
		str = ""+str;

		var m = str.match(/^\s*(Su|Mo|Tu|We|Th|Fr|Sa)\s*(\d\d?):(\d\d)\s*(AM|PM)\s*-\s*(\d\d?):(\d\d)\s*(AM|PM)\s*$/);

		return {
			day: ({"Su": 0, "Mo": 1, "Tu": 2, "We": 3, "Th": 4, "Fr": 5, "Sa": 6})[m[1]],
			start: {
				hours: (m[2] == 12 ? 0 : parseInt(m[2])) + (m[4] == "PM" ? 12 : 0),
				minutes: parseInt(m[3]),
			},
			end: {
				hours: (m[5] == 12 ? 0 : parseInt(m[5])) + (m[7] == "PM" ? 12 : 0),
				minutes: parseInt(m[6]),
			},
		}
	}

	// snapFirstOccurence - Find the first occurence of a class in a range of
	//.dates
	function snapFirstOccurence(dates, times) {
		var startDate = new Date(dates.start),
		    duration = (times.end.hours - times.start.hours) * 3600000 +
		               (times.end.minutes - times.start.minutes) * 60000;

		// Search forward until we get the actual day of the first class
		while (startDate.getDay() != times.day)
			startDate = new Date(3600000 + +startDate);

		startDate.setHours(times.start.hours, times.start.minutes, 0, 0);

		return {
			start: startDate,
			end: new Date(duration + +startDate),
		};
	}

	// snapToDay - If the specified day is within the specified time period and
	// there is a scheduled class on that day, return the start and end times
	// of that class
	function snapToDay(dates, times, day) {
		var startDate = new Date(day),
		    duration = (times.end.hours - times.start.hours) * 3600000 +
		               (times.end.minutes - times.start.minutes) * 60000;

		if (startDate >= dates.end || (86400000 + +startDate) <= dates.start)
			return null;

		if (startDate.getDay() != times.day)
			return null;

		startDate.setHours(times.start.hours, times.start.minutes, 0, 0);

		return {
			start: startDate,
			end: new Date(duration + +startDate),
		};
	}

	// getClasses - Scrape a list of class events from the page
	function getClasses(uid) {
		uid = (uid || Math.random())+"";

		var courses = slice(document.querySelectorAll("div[id*=DERIVED_REGFRM1_DESCR]")),
		    classes = [];

		courses.forEach(function (courseElem) {
			var course = parseCourse(courseElem.getElementsByClassName("PAGROUPDIVIDER")[0].textContent),
			    nbr = "0000",
			    comp = "Unknown",
			    rows = slice(courseElem.querySelectorAll("tr[id*=CLASS_MTG_VW]")),
			    rowNum = 0;

			rows.forEach(function (rowElem) {
				var nbrElem = rowElem.querySelector("span[id^=DERIVED_CLS_DTL_CLASS_NBR]"),
				    compElem = rowElem.querySelector("span[id^=MTG_COMP]"),
				    sched = parseTimeRange(rowElem.querySelector("span[id^=MTG_SCHED]").textContent),
				    location = rowElem.querySelector("span[id^=MTG_LOC]").textContent,
				    dates = parseDateRange(rowElem.querySelector("span[id^=MTG_DATES]").textContent);

				// These fields normally only appear once per course component
				if (nbrElem.textContent != "\u00a0")
					nbr = nbrElem.textContent;

				if (compElem.textContent != "\u00a0")
					comp = compElem.textContent;

				var first = snapFirstOccurence(dates, sched),
				    except = [];

				// For each public holiday that occurs while the university is
				// open, check if a class can be snapped to that day and if so,
				// add its start time to the list of exceptions
				holidays.forEach(function(holiday) {
					var times = snapToDay(dates, sched, holiday);

					if (times)
						except.push(times.start);
				});

				classes.push({
					uid: uid + "::" + nbr + "::" + rowNum,
					start: first.start,
					end: first.end,
					until: dates.end,
					summary: course.code + " " + comp,
					description: course.code + " - " + course.name,
					location: location,
					except: except.length != 0 ? except : null,
				});

				rowNum ++;
			});
		});

		return classes;
	}

	// checkPage - Check if this page contains a class schedule. Since myHub
	// has fairly ugly URLs and abuses AJAX loading, checking the page content
	// is really the only way to do it
	function checkPage() {
		var pageTitle = document.querySelector(".PATRANSACTIONTITLE");
		if (!pageTitle || pageTitle.textContent != "My Class Schedule")
			return false;

		// This assumes that the page header contains a pipe separated
		// description of the timetable
		var title = document.querySelector(".SSSPAGEKEYTEXT");
		if (!title || !(title = title.textContent.match(/(.*?)\s+\|\s+/)))
			return false;

		// If this is the right page, return the name of the timetable
		return title[1];
	}

	// createButton - Create the download button and attach it to the page
	function createButton() {
		var termLink = document.getElementById("DERIVED_SSS_SCT_SSS_TERM_LINK");
		if (!termLink)
			return null;

		var buttonSpan = document.createElement("span");
		buttonSpan.className = "SSSBUTTON_ACTIONLINK";
		buttonSpan.setAttribute("title", "Download timetable in iCalendar format");

		var buttonLink = document.createElement("a");
		buttonLink.className = "SSSBUTTON_ACTIONLINK";
		buttonLink.setAttribute("id", "--nucalendar-download-button");
		buttonLink.setAttribute("tabindex", +(termLink.getAttribute("tabindex") || 0) + 1);
		buttonLink.textContent = "download";

		buttonSpan.appendChild(buttonLink);

		termLink.parentElement.parentElement.parentElement.appendChild(buttonSpan);

		return buttonLink;
	}

	// getButton - Get the download button from the page if it exists or create
	// it if it doesn't
	function getButton() {
		var button = document.getElementById("--nucalendar-download-button");
		if (button)
			return button;

		return createButton();
	}

	// update - If this is the right page, update the generated calendar
	function update() {
		var title = checkPage();
		if (!title)
			return;

		var button = getButton();
		if (!button)
			return;

		var filename = title.replace(/[-\s]+/g, "-").toLowerCase(),
		    calendar = icsWrite(getClasses(filename), title);

		button.setAttribute("href", calendar);
		button.setAttribute("download", filename + ".ics");
	}

	update();

	// This is a really ugly hack, especially since it runs on every page that
	// starts with myhub.newcastle.edu.au, but it gets the script working when
	// the class schedule was loaded with AJAX. Just wait five seconds after
	// you load the page
	setInterval(update, 5000);
})();
