// Offline OCR helper built on Tesseract.js (a free, local OCR library — no
// API key, no cloud service, no per-scan cost). The recognition model is
// fetched once on first use and then reused for every future scan.

let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    // Loaded lazily so the rest of the app never pays the cost of loading
    // the OCR engine unless the user actually clicks "Scan screenshot".
    workerPromise = import('tesseract.js').then(({ createWorker }) => createWorker('eng'));
  }
  return workerPromise;
}

/**
 * Runs OCR on an image file (from a <input type="file"> element) and
 * returns the raw recognized text.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function recognizeImageText(file) {
  const worker = await getWorker();
  const { data } = await worker.recognize(file);
  return data?.text || '';
}
