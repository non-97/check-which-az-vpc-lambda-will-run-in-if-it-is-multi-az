export const handler = async (numberObject: {
  number: number;
}): Promise<{ array: number[] } | Error> => {
  return {
    array: [...Array(numberObject.number).keys()].map((i) => ++i),
  };
};
