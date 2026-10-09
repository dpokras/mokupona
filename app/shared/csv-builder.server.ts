const newLine = "\n";

const UTF8_BOM = "\uFEFF";

export interface CSVReturnObject {
  mimeType: "text/csv; charset=utf-8";

  size: number;

  data: string;
}

export function buildCSVObject(
  header: string[],
  values: string[][],
  separator = ",",
): CSVReturnObject {
  const combinedArray = [[...header], ...values];
  const sanitizedArray = combinedArray.map((valueArray) => {
    return valueArray.map((value) => sanitizeCSVValue(value));
  });

  const data = UTF8_BOM + nestedArrayToCSVString(sanitizedArray, separator);
  return {
    mimeType: "text/csv; charset=utf-8",
    size: Buffer.byteLength(data, "utf8"),
    data,
  };
}

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
// Phone numbers and plain numbers start with + or - but hold no letters, so
// they can't call a spreadsheet function and are kept as typed.
const NUMBER_LIKE = /^[+-]?[\d\s().\/-]+$/;

function neutralizeFormula(value: string) {
  if (!FORMULA_TRIGGER.test(value) || NUMBER_LIKE.test(value)) return value;
  return "'" + value;
}

function sanitizeCSVValue(rawValue: string) {
  const value = neutralizeFormula(rawValue);
  const needsSanitization = [",", "\n", "\r", '"'].some((character) =>
    value.includes(character),
  );

  if (needsSanitization) return '"' + value.replaceAll('"', '""') + '"';
  return value;
}

function arrayToCSVString(array: string[], separator = ","): string {
  return array.join(separator) + newLine;
}

function nestedArrayToCSVString(array: string[][], separator = ","): string {
  let text = "";

  array.forEach((nestedArray) => {
    text += arrayToCSVString(nestedArray, separator);
  });

  return text;
}
