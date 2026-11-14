// Minimal reproduction of the documented return-type mismatch. Never executed.
export const originalCallback = async (url: string): Promise<string> => {
  const response = await fetch(url);
  return response;
};
