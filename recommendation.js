(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.JeansRecommendation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const toInches = cm => cm / 2.54;
  const unique = values => [...new Set(values)];

  function optionWidth(value) {
    const match = String(value).trim().match(/^W?\s*(\d{2})(?:\s*inch)?(?:\s*[\/\- ]\s*L\s*\d{2})?$/i);
    return match ? Number(match[1]) : null;
  }

  function optionLength(value) {
    const match = String(value).match(/\bL\s*(\d{2})\b/i);
    return match ? Number(match[1]) : null;
  }

  function measurementCm(value, heading = '') {
    const text = String(value || '').trim();
    const numbers = text.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (!numbers.length) return null;
    const amount = numbers.length > 1 ? (numbers[0] + numbers[1]) / 2 : numbers[0];
    if (/cm/i.test(text + heading)) return amount;
    if (/\b(?:in|inch|inches)\b|["″]/i.test(text + heading)) return amount * 2.54;
    return amount > 50 ? amount : amount * 2.54;
  }

  function chartMapping(scan, widths) {
    let best = { rows: new Map(), direct: 0, ordered: 0, relevance: -Infinity };
    for (const guide of scan.sizeGuides || []) {
      // A garment chart measures the jeans, not the shopper's body.
      if (/\b(?:garment|swim|swimwear|bikini|tee|t-shirt|shirt|shoe)\b/i.test(guide.title || '')) continue;
      const headers = guide.headers || [];
      const waistIndex = headers.findIndex(value => /\bwaist\b/i.test(value));
      if (waistIndex < 0) continue;
      const hipIndex = headers.findIndex(value => /\bhip\b/i.test(value));
      const thighIndex = headers.findIndex(value => /\bthigh\b/i.test(value));
      const sizeIndex = headers.findIndex(value => /\b(?:size|jean)\b/i.test(value));
      const rows = guide.rows || [];
      const mapped = new Map();
      let direct = 0;
      let ordered = 0;
      for (const [index, row] of rows.entries()) {
        const waistCm = measurementCm(row[waistIndex], headers[waistIndex]);
        if (waistCm === null) continue;
        const labelWidth = sizeIndex >= 0 ? optionWidth(row[sizeIndex]) : null;
        const waistInches = toInches(waistCm);
        let width = widths.find(value => value === labelWidth);
        if (width === undefined) width = widths.find(value => Math.abs(value - waistInches) < 0.3);
        if (width !== undefined) direct++;
        else if (rows.length === widths.length && widths[index] !== undefined) {
          width = widths[index];
          ordered++;
        }
        if (width === undefined) continue;
        mapped.set(width, {
          waistCm,
          hipCm: hipIndex >= 0 ? measurementCm(row[hipIndex], headers[hipIndex]) : null,
          thighCm: thighIndex >= 0 ? measurementCm(row[thighIndex], headers[thighIndex]) : null
        });
      }
      const relevance = (/\b(?:apparel|jeans?|denim|pants|trousers|bottoms)\b/i.test(guide.title || '') ? 2 : 0) +
        (/\bbody\b/i.test(guide.title || '') ? 1 : 0);
      if (mapped.size && (direct > best.direct || (direct === best.direct &&
          (relevance > best.relevance || (relevance === best.relevance && mapped.size > best.rows.size))))) {
        best = { rows: mapped, direct, ordered, relevance };
      }
    }
    return best;
  }

  function guideRelevance(guide, options) {
    const title = String(guide.title || '');
    if (/\b(?:garment|swim|swimwear|bikini|tee|t-shirt|shirt|shoe)\b/i.test(title)) return -Infinity;
    const headers = guide.headers || [];
    const sizeIndex = headers.findIndex(value => /\bsize\b/i.test(value));
    const waistIndex = headers.findIndex(value => /\bwaist\b/i.test(value));
    if (sizeIndex < 0 || waistIndex < 0) return -Infinity;
    const matching = (guide.rows || []).filter(row => options.includes(row[sizeIndex]) &&
      measurementCm(row[waistIndex], headers[waistIndex]) !== null).length;
    if (!matching) return -Infinity;
    return matching * 10 + (/\b(?:apparel|jeans?|denim|pants|trousers|bottoms)\b/i.test(title) ? 8 : 0) +
      (/\bbody\b/i.test(title) ? 4 : 0) + (headers.some(value => /\bhip\b/i.test(value)) ? 1 : 0);
  }

  function naturalFit(details = {}) {
    const facts = [details.fit?.[0], details.rise?.[0]].filter(Boolean);
    return facts.length ? facts.join(' · ').slice(0, 150) : 'The listing does not describe its intended fit.';
  }

  function heightLengthRange(scan, heightCm) {
    if (!Number.isFinite(Number(heightCm)) || Number(heightCm) <= 0) return null;
    const heightInches = Math.round(Number(heightCm) / 2.54);
    for (const guide of scan.sizeGuides || []) {
      if (!/height/i.test(guide.headers?.[0] || '')) continue;
      const lengthRow = (guide.rows || []).find(row => /full.length|inseam|leg length/i.test(row[0] || ''));
      if (!lengthRow) continue;
      for (let index = 1; index < guide.headers.length; index++) {
        const heading = guide.headers[index];
        const heights = [...heading.matchAll(/(\d+)'\s*(\d{1,2})?/g)].map(match => Number(match[1]) * 12 + Number(match[2] || 0));
        if (!heights.length) continue;
        const minimum = /or shorter/i.test(heading) ? 0 : heights[0];
        const maximum = /or taller/i.test(heading) ? Infinity : heights.at(-1);
        if (heightInches < minimum || heightInches > maximum) continue;
        const lengths = String(lengthRow[index] || '').match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
        if (lengths.length) return { minimum: lengths[0], maximum: lengths.at(-1) };
      }
    }
    return null;
  }

  function recommend(scan, profile, preference = 'as-designed') {
    const base = { size: null, status: 'insufficient-data', naturalFit: naturalFit(scan?.details), reasons: [], notes: [] };
    if (![profile?.waistCm, profile?.hipCm].every(value => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0)) {
      return { ...base, status: 'missing-profile', notes: ['Add waist and hip measurements to get a recommendation.'] };
    }

    const availableCombined = scan?.sizes?.combined || [];
    const availableWaist = scan?.sizes?.waist || [];
    const unavailableCombined = scan?.sizes?.unavailable?.combined || [];
    const unavailableWaist = scan?.sizes?.unavailable?.waist || [];
    const useCombined = availableCombined.length > 0 || (availableWaist.length === 0 && unavailableWaist.length === 0);
    const combined = useCombined ? [...availableCombined, ...unavailableCombined] : [];
    const separate = [...availableWaist, ...unavailableWaist];
    const options = combined.length ? combined : separate;
    const availableOptions = combined.length ? availableCombined : availableWaist;
    if (!options.length) return { ...base, notes: ['No product sizes were found on this listing.'] };

    const widths = unique(options.map(optionWidth).filter(Number.isFinite)).sort((a, b) => a - b);
    const chart = chartMapping(scan, widths);
    const waistCm = Number(profile.waistCm);
    const hipCm = Number(profile.hipCm);
    const thighCm = profile.thighCm === undefined || profile.thighCm === '' ? null : Number(profile.thighCm);
    const advice = (scan?.details?.sizingAdvice || []).join(' ');
    const adviceShift = /runs? (?:a bit )?small|(?:buy|suggest|recommend).*sizes? up|size up/i.test(advice) ? 1 :
      /runs? (?:a bit )?large|(?:buy|suggest|recommend).*sizes? down|size down/i.test(advice) ? -1 : 0;
    let chosenWidth;
    let evidence = null;
    let preferenceLimited = false;
    let adviceApplied = false;
    if (widths.length) {
      const widthScore = width => {
        const row = chart.rows.get(width);
        const waistTarget = row?.waistCm ?? width * 2.54;
        const hipPenalty = row?.hipCm == null ? 0 :
          Math.abs(row.hipCm - hipCm) * 0.35 + Math.max(0, hipCm - row.hipCm) * 0.8;
        const thighPenalty = row?.thighCm == null || !Number.isFinite(thighCm) ? 0 :
          Math.abs(row.thighCm - thighCm) * 0.45 + Math.max(0, thighCm - row.thighCm);
        return Math.abs(waistTarget - waistCm) + Math.max(0, waistCm - waistTarget) * 0.6 + hipPenalty + thighPenalty;
      };
      chosenWidth = widths.reduce((best, width) => widthScore(width) < widthScore(best) ? width : best, widths[0]);
      const shift = preference === 'closer' ? -1 : preference === 'roomier' ? 1 : 0;
      const chartIndex = widths.indexOf(chosenWidth);
      const index = Math.max(0, Math.min(widths.length - 1, chartIndex + adviceShift));
      adviceApplied = index !== chartIndex;
      const shiftedIndex = Math.max(0, Math.min(widths.length - 1, index + shift));
      preferenceLimited = shift !== 0 && shiftedIndex === index;
      chosenWidth = widths[shiftedIndex];
      evidence = chart.rows.get(chosenWidth);
    }

    let choices = widths.length ? options.filter(value => optionWidth(value) === chosenWidth) : [];
    if (!widths.length) {
      const selectedGuide = (scan.sizeGuides || []).reduce((best, guide) =>
        guideRelevance(guide, options) > guideRelevance(best || {}, options) ? guide : best, null);
      const chartRows = (selectedGuide ? [selectedGuide] : []).flatMap(guide => {
        const sizeIndex = (guide.headers || []).findIndex(value => /\bsize\b/i.test(value));
        const waistIndex = (guide.headers || []).findIndex(value => /\bwaist\b/i.test(value));
        const hipIndex = (guide.headers || []).findIndex(value => /\bhip\b/i.test(value));
        if (sizeIndex < 0 || waistIndex < 0) return [];
        return (guide.rows || []).map(row => ({
          label: row[sizeIndex], waistCm: measurementCm(row[waistIndex], guide.headers[waistIndex]),
          hipCm: hipIndex < 0 ? null : measurementCm(row[hipIndex], guide.headers[hipIndex])
        }));
      }).filter(row => options.includes(row.label) && row.waistCm !== null);
      if (!chartRows.length) return { ...base, notes: ['The size labels could not be matched to body measurements in a chart.'] };
      const ordered = options.map(label => chartRows.find(row => row.label === label)).filter(Boolean);
      let index = ordered.reduce((best, row, i) => Math.abs(row.waistCm - waistCm) < Math.abs(ordered[best].waistCm - waistCm) ? i : best, 0);
      const shift = preference === 'closer' ? -1 : preference === 'roomier' ? 1 : 0;
      const shiftedIndex = Math.max(0, Math.min(ordered.length - 1, index + shift));
      preferenceLimited = shift !== 0 && shiftedIndex === index;
      index = shiftedIndex;
      evidence = ordered[index];
      choices = [evidence.label];
    }

    const hasInseam = profile.inseamCm != null && profile.inseamCm !== '' &&
      Number.isFinite(Number(profile.inseamCm)) && Number(profile.inseamCm) > 0;
    const heightGuide = hasInseam ? null : heightLengthRange(scan, profile.heightCm);
    const wantedLength = hasInseam ? toInches(Number(profile.inseamCm)) : heightGuide ?
      (heightGuide.minimum + heightGuide.maximum) / 2 : null;
    const offeredLengths = unique(choices.map(optionLength).filter(Number.isFinite));
    const lengthUnresolved = wantedLength == null &&
      (offeredLengths.length > 1 || (!combined.length && (scan?.sizes?.length || []).length > 1));
    let size = choices.reduce((best, choice) => {
      if (!best) return choice;
      if (wantedLength == null) return best;
      return Math.abs((optionLength(choice) ?? wantedLength) - wantedLength) <
        Math.abs((optionLength(best) ?? wantedLength) - wantedLength) ? choice : best;
    }, null);
    if (!size) return { ...base, notes: ['No product size matches the selected fit.'] };
    if (lengthUnresolved && chosenWidth != null) size = `W${chosenWidth}`;
    const soldOut = lengthUnresolved ? !availableOptions.some(value => optionWidth(value) === chosenWidth) :
      !availableOptions.includes(size);
    const availableSize = soldOut ? availableOptions.reduce((best, choice) => {
      if (!best) return choice;
      const distance = value => Math.abs((optionWidth(value) ?? 0) - (optionWidth(size) ?? 0)) * 10 +
        (wantedLength == null ? 0 : Math.abs((optionLength(value) ?? wantedLength) - (optionLength(size) ?? wantedLength)));
      return distance(choice) < distance(best) ? choice : best;
    }, null) : null;
    let combinationUnconfirmed = false;
    if (!combined.length && widths.length && (scan.sizes.length || []).length) {
      const lengths = (scan.sizes.length || []).map(value => Number(String(value).match(/^(?:L\s*)?(\d{2})$/i)?.[1])).filter(Number.isFinite);
      if (lengths.length && wantedLength != null) {
        const length = lengths.reduce((best, value) => Math.abs(value - wantedLength) < Math.abs(best - wantedLength) ? value : best, lengths[0]);
        size = `W${chosenWidth} L${length}`;
        combinationUnconfirmed = true;
      }
    }

    const reasons = [];
    const notes = [];
    const explanationFacts = [];
    if (lengthUnresolved) notes.push('Choose a length on the product page; no inseam or retailer height guide confirms one.');
    if (combinationUnconfirmed) notes.push('Waist and length are listed separately; confirm this exact combination is in stock on the product page.');
    if (evidence?.waistCm != null) {
      reasons.push(`Your waist is ${waistCm} cm; the chart associates ${size} with about ${Math.round(evidence.waistCm)} cm.`);
      const hipComparison = evidence.hipCm != null ? ` Your hip is ${hipCm} cm; the chart lists about ${Math.round(evidence.hipCm)} cm.` : '';
      const chartSize = chosenWidth != null ? `W${chosenWidth}` : size;
      explanationFacts.push({ id: 'waist', title: hipComparison ? 'Waist and hip' : 'Waist', kind: 'chart', text: `Your waist is ${waistCm} cm. The retailer’s chart places ${chartSize} at about ${Math.round(evidence.waistCm)} cm.${hipComparison}` });
    } else if (chosenWidth != null) {
      reasons.push(`Your waist is ${waistCm} cm; ${size.match(/W?\s*\d{2}/)?.[0] || size} is the closest numeric waist label.`);
      explanationFacts.push({ id: 'waist', title: 'Waist', kind: 'label', text: `${size.match(/W?\s*\d{2}/)?.[0] || size} is the closest listed waist label to your ${waistCm} cm waist; the listing does not verify that measurement.` });
    }
    if (evidence?.hipCm != null) reasons.push(`The chart lists about ${Math.round(evidence.hipCm)} cm at the hip; your hip is ${hipCm} cm.`);
    if (evidence?.thighCm != null && Number.isFinite(thighCm)) reasons.push(`The chart lists about ${Math.round(evidence.thighCm)} cm at the thigh; your thigh is ${thighCm} cm.`);
    const selectedLength = optionLength(size);
    if (selectedLength != null) {
      notes.push(`L${selectedLength} is a length label, not a verified garment inseam measurement.`);
      if (hasInseam) explanationFacts.push({ id: 'length', title: 'Length', kind: 'label', text: `L${selectedLength} is the closest listed length label to your ${profile.inseamCm} cm inseam. The garment’s measured inseam is unconfirmed.` });
      else if (heightGuide) explanationFacts.push({ id: 'length', title: 'Length', kind: 'height-guide', text: `The retailer’s height guide suggests ${heightGuide.minimum}–${heightGuide.maximum} in lengths for your height; L${selectedLength} is a listed length label.` });
      else notes.push('This is the only listed length for that waist; its fit on your height is unconfirmed.');
      const guideForHeight = heightLengthRange(scan, profile.heightCm);
      if (guideForHeight) {
        const guidance = `${guideForHeight.minimum}–${guideForHeight.maximum} in`;
        if (selectedLength >= guideForHeight.minimum && selectedLength <= guideForHeight.maximum)
          reasons.push(`Your height falls in the retailer’s ${guidance} length guide; L${selectedLength} is within that range.`);
        else notes.push(`Your height points to the retailer’s ${guidance} length range; ${hasInseam ? 'the size shown follows your measured inseam instead' : 'no listed length matches it'}.`);
      }
    } else {
      const listedInseam = (scan?.details?.inseam || []).find(value => /\binseam\s*:/i.test(value));
      const listedInseamCm = listedInseam ? measurementCm(listedInseam) : null;
      if (listedInseamCm != null && hasInseam) {
        const difference = listedInseamCm - Number(profile.inseamCm);
        const inches = Math.round(toInches(listedInseamCm) * 10) / 10;
        notes.push(`This style lists a fixed ${inches} in inseam, about ${Math.round(Math.abs(difference))} cm ${difference >= 0 ? 'longer' : 'shorter'} than your ${profile.inseamCm} cm inseam.`);
        explanationFacts.push({ id: 'length', title: 'Length', kind: 'listed-measurement', text: `The listing gives a ${inches} in inseam, about ${Math.round(Math.abs(difference))} cm ${difference >= 0 ? 'longer' : 'shorter'} than your ${profile.inseamCm} cm inseam.` });
      }
    }
    const status = evidence && (chart.direct > 0 || !widths.length) ? 'recommended' : 'tentative';
    if (status === 'tentative') notes.unshift('Fit estimate based on the retailer’s listed sizes and fit guidance; actual fit may vary.');
    if (adviceApplied) reasons.push(`The listing says this style ${adviceShift > 0 ? 'runs small' : 'runs large'}, so the starting size was adjusted by one waist size.`);
    if (adviceApplied) explanationFacts.push({ id: 'fit', title: 'Fit', kind: 'retailer', text: `The retailer says this style runs ${adviceShift > 0 ? 'small' : 'large'}, so the waist choice was adjusted by one listed size.` });
    else {
      const fitDescription = String(scan?.details?.fit?.[0] || '').split(/[.!?]/)[0].trim();
      if (fitDescription.length <= 95 && /\b(?:wide|straight|skinny|slim|loose|relaxed|flare|bootcut|baggy)\b/i.test(fitDescription))
        explanationFacts.push({ id: 'fit', title: 'Designed fit', kind: 'retailer', text: `The retailer describes these jeans as ${fitDescription.toLowerCase()}.` });
    }
    if (preferenceLimited) notes.push(`No ${preference === 'closer' ? 'smaller' : 'larger'} product size was found for this fit preference.`);
    else if (preference !== 'as-designed') reasons.push(`Selected for a ${preference === 'closer' ? 'closer' : 'roomier'} fit than the product’s intended silhouette.`);
    if (soldOut) {
      notes.unshift(`${size} appears sold out on this listing.`);
      if (availableSize) {
        const widthGap = Math.abs((optionWidth(availableSize) ?? 0) - (optionWidth(size) ?? 0));
        notes.push(`${availableSize} is the closest available size${widthGap >= 2 ? ', but it may fit substantially differently' : ''}.`);
      } else notes.push('No sizes currently appear available on this listing.');
      explanationFacts.push({ id: 'availability', title: 'Availability', kind: 'stock', text: `${size} appears sold out${availableSize ? `; ${availableSize} is the closest available option, but may fit differently` : '; no available alternative was found'}.` });
    }
    if (lengthUnresolved) explanationFacts.push({ id: 'uncertainty', title: 'Choose length', kind: 'limitation', text: 'Your waist size is selected, but a jeans length still needs to be chosen on the product page.' });
    else if (combinationUnconfirmed) explanationFacts.push({ id: 'uncertainty', title: 'Check stock', kind: 'limitation', text: 'Waist and length are listed separately. Confirm this exact combination is in stock before ordering.' });
    else if (status === 'tentative') explanationFacts.push({ id: 'uncertainty', title: 'Estimate', kind: 'limitation', text: 'This is an estimate from listed sizes; a matching body size chart was not confirmed.' });
    else if (preferenceLimited) explanationFacts.push({ id: 'uncertainty', title: 'Fit choice', kind: 'limitation', text: `No ${preference === 'closer' ? 'smaller' : 'larger'} listed size was found for this fit choice.` });
    return { status, size, soldOut, availableSize: lengthUnresolved && availableSize ? `W${optionWidth(availableSize)}` : availableSize,
      lengthUnresolved, naturalFit: base.naturalFit, reasons, notes, explanationFacts };
  }

  return { recommend };
});
