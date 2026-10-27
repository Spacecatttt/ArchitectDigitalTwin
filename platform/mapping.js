// Відображення «формат пристрою → модель двійника» (домен DCE → DTE)
// Шлюз верстата публікує короткі поля; модель двійника — підмоделі axes, spindle,
// vibration, status, sync з twin/*.tm.jsonld. Заміна шлюзу змінить лише цей файл.
function mapToDittoProtocolMsg(headers, textPayload, bytePayload, contentType) {
  var m = JSON.parse(textPayload);
  var name = headers["mqtt.topic"].split("/")[1];          // pzks/<name>/telemetry
  var features = {
    axes: { properties: {
      positionX: m.x, positionY: m.y, positionZ: m.z, feedRate: m.f, currentX: m.ix } },
    spindle: { properties: {
      speed: m.s, load: m.ld, bearingTemperature: m.tb } },
    vibration: { properties: {
      rms: m.vr, peak: m.vp, crestFactor: m.vc, kurtosis: m.vk,
      band1: m.b1, band2: m.b2, band3: m.b3, band4: m.b4 } },
    status: { properties: {
      mode: m.md, toolNumber: m.tl, alarmCode: m.al, coolantTemperature: m.tc } },
    sync: { properties: { seq: m.seq, ts: m.ts } }
  };
  return Ditto.buildDittoProtocolMsg("org.pzks", name, "things", "twin",
    "commands", "merge", "/features",
    { "content-type": "application/merge-patch+json" }, features);
}
