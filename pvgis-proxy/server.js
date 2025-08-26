// Node 18+ (tiene fetch nativo). Si usas Node <18, instala 'node-fetch'.
//import express from "express"; // o require('express') si usas CJS
//import cors from "cors";

const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors({
  origin: ['https://mponsnieto.github.io', 'https://aterraproject.clusterteib.es'],
  methods: ['GET']
}));
const compression = require("compression");
const fetch = require("node-fetch");

//const path = require("path");
//app.use(express.static(path.join(__dirname, "public")));


// Utilidad: parsear el CSV TMY de PVGIS a objetos
function parsePVGISTMY(csvText) {
  const lines = csvText.split(/\r?\n/).filter(Boolean);

  // PVGIS mete comentarios al inicio con '#'
  // Buscamos la fila de cabecera real (contiene "time(UTC)")
  const headerIdx = lines.findIndex(line => line.includes("time(UTC)"));
  if (headerIdx === -1) {
    throw new Error("No se encontró una línea de cabecera con 'time(UTC)' en el CSV PVGIS.");
  }

  const headerLine = lines[headerIdx];

  // Detecta delimitador automáticamente
  const delimiter = headerLine.includes(";") ? ";" : ",";

  const headers = headerLine.split(delimiter).map(h => h.trim());
  const dataLines = lines.slice(headerIdx + 1);

  // Convierte a objetos
  const rows = dataLines.map(line => {
    const cols = line.split(delimiter);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (cols[i] ?? "").trim();
    });
    return obj;
  });

  return rows;
}


// Convierte "YYYYMMDD:HHmm" a { month, day, horaDecimal }
function parseTimeUTC(str) {
  if (!str || !str.includes(":")) {
    // Ej.: str = "" o undefined porque la columna no se parseó bien
    return null;
  }
  // "YYYYMMDD:HHmm"
  const [date, hm] = str.split(":");
  if (!date || !hm || date.length < 8 || hm.length < 2) return null;

  const year = +date.slice(0, 4);
  const month = +date.slice(4, 6);
  const day = +date.slice(6, 8);
  const hour = +hm.slice(0, 2);
  const min = +hm.slice(2, 4) || 0;

  if (![year, month, day, hour, min].every(Number.isFinite)) return null;

  return { year, month, day, hour, min, horaDecimal: hour + min / 60 };
}


// API: /pvgis/dia?lat=..&lon=..&fecha=YYYY-MM-DD
app.get("/pvgis/dia", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const fecha = req.query.fecha; // "YYYY-MM-DD"

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !fecha) {
      return res.status(400).json({ error: "Parámetros: lat, lon, fecha (YYYY-MM-DD)" });
    }

    const url = `https://re.jrc.ec.europa.eu/api/tmy?lat=${lat}&lon=${lon}&outputformat=csv`;
    const resp = await fetch(url);
    if (!resp.ok) {
      return res.status(resp.status).send(await resp.text());
    }

    const csvText = await resp.text();
    const rows = parsePVGISTMY(csvText);

    const [Y, M, D] = fecha.split("-").map(Number);
    if (![Y, M, D].every(Number.isFinite)) {
      return res.status(400).json({ error: "fecha debe ser YYYY-MM-DD" });
    }

    // Posibles nombres de columnas
    const colTime = "time(UTC)";
    // En TMY suele ser así, pero añadimos alternativas por si acaso:
    const colDNI = ["Gb(n)", "DNI", "Gb(n) [W/m2]"];
    const colDHI = ["Gd(h)", "DHI"];
    const colGHI = ["G(h)", "GHI"];

    const pick = (row, names) => {
      for (const n of names) {
        if (n in row) return row[n];
      }
      return undefined;
    };

    const OUT = [];
    for (const r of rows) {
      const t = parseTimeUTC(r[colTime]);
      if (!t) continue;

      if (t.month === M && t.day === D && t.horaDecimal >= 6 && t.horaDecimal <= 20) {
        const DNI = Number(pick(r, colDNI));
        const DHI = Number(pick(r, colDHI));
        const GHI = Number(pick(r, colGHI));
        OUT.push({
          Hora: t.horaDecimal,
          DNI: Number.isFinite(DNI) ? DNI : null,
          DHI: Number.isFinite(DHI) ? DHI : null,
          GHI: Number.isFinite(GHI) ? GHI : null
        });
      }
    }

    OUT.sort((a, b) => a.Hora - b.Hora);
    res.json({ lat, lon, fecha, n: OUT.length, datos: OUT });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PVGIS proxy escuchando en el puerto ${PORT}`);
});


/*const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PVGIS proxy escuchando en http://localhost:${PORT}`));*/