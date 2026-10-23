(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SizeSceneAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const keys = ['waist', 'length', 'combined', 'other'];
  const tidy = value => String(value || '').replace(/\s+/g, ' ').trim();
  const matchText = value => tidy(value).toLowerCase().replace(/[″“”]/g, '"');
  const validOption = /^(?:W\s*)?(?:2[2-9]|3\d|4\d)(?:\s*inch)?$|^(?:XXS|XS|S|M|L|XL|XXL|\d{1,2})$|^W\s*\d{2}\s*[\/\- ]\s*L\s*\d{2}$|^(?:2[2-9]|3\d|4\d)\s*\/\s*(?:2[6-9]|3\d)$/i;

  function shouldEnhance(scan) {
    if (!scan?.page) return false;
    const options = keys.some(key => (scan.sizes?.[key]?.length || 0) + (scan.sizes?.unavailable?.[key]?.length || 0));
    return scan.page.store === 'Other' || !options || (scan.sizeGuides?.length || 0) > 1 ||
      (!scan.sizeGuides?.length && scan.sizeGuideStatus !== 'image-only');
  }

  function mergeImageChart(scan, extraction) {
    if (!scan || scan.sizeGuides?.length || extraction?.chartType !== 'body' ||
        !['in', 'cm'].includes(extraction.unit) || !Array.isArray(extraction.rows) ||
        extraction.rows.length < 2 || extraction.rows.length > 40) return scan;
    const options = ['waist', 'combined', 'other'].flatMap(key =>
      [...(scan.sizes?.[key] || []), ...(scan.sizes?.unavailable?.[key] || [])]);
    const listed = new Set(options.map(value => String(value).match(/^(?:W\s*)?(\d{2})(?:\s*(?:\/|\-|\s)\s*L\s*\d{2})?$/i)?.[1] || String(value).trim().toUpperCase()));
    const number = value => {
      const text = String(value || '').trim().replace(/[″”]/g, '"')
        .replace(/\s*(?:"|inches|inch|in|cm)\s*$/i, '')
        .replace('½', ' 1/2').replace('¼', ' 1/4').replace('¾', ' 3/4');
      const match = text.match(/^(\d{1,3})(?:\.(\d+))?(?:\s+(\d)\/(\d))?$/);
      return match ? Number(match[1]) + (match[2] ? Number(`0.${match[2]}`) : 0) +
        (match[3] ? Number(match[3]) / Number(match[4]) : 0) : NaN;
    };
    const rows = extraction.rows.map(row => {
      const label = String(row?.size || '').trim().toUpperCase();
      return { label, waist: number(row?.waist), hip: number(row?.hip) };
    }).filter(row => listed.has(row.label) && Number.isFinite(row.waist) && Number.isFinite(row.hip));
    if (rows.length < 2 || new Set(rows.map(row => row.label)).size !== rows.length) return scan;
    const factor = extraction.unit === 'in' ? 2.54 : 1;
    if (rows.some(row => row.waist * factor < 40 || row.waist * factor > 140 ||
        row.hip * factor < 55 || row.hip * factor > 170 || row.hip - row.waist < 3)) return scan;
    const numeric = rows.every(row => /^\d{2}$/.test(row.label));
    if (numeric) {
      const sorted = [...rows].sort((a, b) => Number(a.label) - Number(b.label));
      if (sorted.some((row, index) => index > 0 &&
          (row.waist <= sorted[index - 1].waist || row.hip <= sorted[index - 1].hip))) return scan;
    }
    const unit = extraction.unit;
    const chart = { title: 'Body size chart · AI-read image', headers: ['Size', `Waist (${unit})`, `Hip (${unit})`],
      rows: rows.map(row => [row.label, `${row.waist} ${unit}`, `${row.hip} ${unit}`]) };
    return { ...scan, sizeGuides: [chart], sizeGuideStatus: 'image-read', imageChartUsed: true,
      hasSizingInformation: true };
  }

  function merge(scan, snapshot, extraction) {
    if (!scan || !Array.isArray(snapshot?.items) || !extraction || typeof extraction !== 'object') return scan;
    const evidence = new Map(snapshot.items.map(item => [item.id, item]));
    const additions = { waist: [], length: [], combined: [], other: [], unavailable: { waist: [], length: [], combined: [], other: [] } };
    for (const id of Array.isArray(extraction.productOptionIds) ? extraction.productOptionIds.slice(0, 120) : []) {
      const item = evidence.get(id);
      if (item?.kind !== 'option') continue;
      const label = tidy(item.label);
      if (!validOption.test(label) || !matchText(item.text).includes(matchText(label))) continue;
      const slash = label.match(/^(2[2-9]|3\d|4\d)\s*\/\s*(2[6-9]|3\d)$/);
      const normalized = slash ? `W${slash[1]} L${slash[2]}` : label;
      const kind = /^W\s*\d{2}\s*[\/\- ]\s*L/i.test(normalized) ? 'combined' :
        /\b(?:length|inseam|leg)\b/i.test(item.context || '') && /^L?\s*(?:2[6-9]|3[0-8])$/i.test(label) ? 'length' : 'waist';
      const target = item.availability === 'unavailable' ? additions.unavailable : additions;
      if (!target[kind].includes(normalized)) target[kind].push(normalized);
    }

    const sizeGuides = [];
    for (const chart of Array.isArray(extraction.charts) ? extraction.charts.slice(0, 5) : []) {
      const source = evidence.get(chart.evidenceId);
      if (source?.kind !== 'chart' || !Array.isArray(chart.headers) || !Array.isArray(chart.rows)) continue;
      if (/\b(?:swim|swimwear|bikini|tee|t-shirt|shirt|shoe)\b/i.test(`${source.context || ''} ${chart.title || ''}`)) continue;
      const headers = chart.headers.map(tidy);
      if (headers.length < 2 || headers.length > 10 || !headers.some(value => /waist|hip|inseam|length|thigh/i.test(value))) continue;
      if (!headers.every(value => {
        const name = value.replace(/\s*\((?:cm|in|inch|inches)\)/i, '');
        return matchText(source.text).includes(matchText(name)) ||
          (/^size$/i.test(name) && /\bmeasurement\b/i.test(source.text));
      })) continue;
      const rows = chart.rows.slice(0, 40).map(row => Array.isArray(row) ? row.map(tidy) : []);
      const validRows = rows.filter(row => row.length === headers.length && row.every(cell => cell && matchText(source.text).includes(matchText(cell))));
      if (!validRows.length) continue;
      const statedTitle = tidy(chart.title).slice(0, 80) || 'Size chart';
      const sourceSaysGarment = /\bgarment\b/i.test(source.text);
      const sourceSaysBody = /\bbody\b/i.test(source.text);
      if (sourceSaysGarment && sourceSaysBody) continue;
      const title = sourceSaysGarment ? 'Garment size chart' : statedTitle;
      sizeGuides.push({ title, headers, rows: validRows });
    }

    const fits = [];
    for (const id of Array.isArray(extraction.fitEvidenceIds) ? extraction.fitEvidenceIds.slice(0, 5) : []) {
      const item = evidence.get(id);
      if (item?.kind === 'detail' && tidy(item.text).length <= 300 && !fits.includes(tidy(item.text))) fits.push(tidy(item.text));
    }
    const originalSizes = scan.sizes || additions;
    const hasCombinedSizes = [originalSizes, originalSizes.unavailable, additions, additions.unavailable]
      .some(group => group?.combined?.length);
    if (hasCombinedSizes) {
      const letterSize = /^(?:XXS|XS|S|M|L|XL|XXL)$/i;
      additions.waist = additions.waist.filter(label => !letterSize.test(label));
      additions.unavailable.waist = additions.unavailable.waist.filter(label => !letterSize.test(label));
    }
    const hasOptions = keys.some(key => additions[key].length || additions.unavailable[key].length);
    return {
      ...scan,
      sizes: scan.page.store === 'Other' && hasOptions ? additions : {
        ...originalSizes,
        ...Object.fromEntries(keys.map(key => [key, [...new Set([...(originalSizes[key] || []), ...additions[key]])]])),
        unavailable: Object.fromEntries(keys.map(key => [key, [...new Set([...(originalSizes.unavailable?.[key] || []), ...additions.unavailable[key]])]]))
      },
      sizeGuides: sizeGuides.length ? sizeGuides : (scan.sizeGuides || []),
      sizeGuideStatus: scan.sizeGuides?.length || sizeGuides.length ? 'table' : scan.sizeGuideStatus,
      details: { ...scan.details, fit: [...new Set([...(scan.details?.fit || []), ...fits])] },
      hasSizingInformation: !!(scan.hasSizingInformation || hasOptions || sizeGuides.length || fits.length),
      aiAssisted: !!(hasOptions || sizeGuides.length || fits.length)
    };
  }

  return { shouldEnhance, merge, mergeImageChart };
});
