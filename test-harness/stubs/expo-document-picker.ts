/** expo-document-picker stub: tests point it at a file (or simulate cancel). */
let nextResult: { canceled: boolean; assets?: { uri: string }[] } = {
  canceled: true,
};

export function __setPickerResult(result: {
  canceled: boolean;
  assets?: { uri: string }[];
}): void {
  nextResult = result;
}

export async function getDocumentAsync(): Promise<typeof nextResult> {
  return nextResult;
}
