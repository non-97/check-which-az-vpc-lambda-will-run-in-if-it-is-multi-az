import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

interface HandlerParameters {
  id: number;
}

export const handler = async (event: HandlerParameters): Promise<void> => {
  const response = await axios.get("https://checkip.amazonaws.com");

  const result = {
    id: event.id,
    response_data: response.data.replace(/\r?\n/g, ""),
  };

  console.log(JSON.stringify(result, null, 2));

  return;
};
