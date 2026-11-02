import { apiClient } from "@/shared/lib/api/client";
import { normalizeArrayResponse } from "@/shared/lib/api/response-normalizer";
import type {
  Country,
  City,
  Language,
  Translation,
} from "../model/types";

export const dictionaryApi = {
  /**
   * Получить список стран
   * @param language - Язык для переводов (ru-RU, kk-KZ, en-US)
   * @param params - Параметры пагинации, фильтрации и сортировки
   */
  getCountries: async (
    language: string = "ru-RU",
    params?: {
      page?: number;
      limit?: number;
      search?: string;
      sort_by?: string;
      sort_order?: "asc" | "desc";
    }
  ): Promise<Country[]> => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append("page", String(params.page));
    if (params?.limit) queryParams.append("limit", String(params.limit));
    if (params?.search) queryParams.append("search", params.search);
    if (params?.sort_by) queryParams.append("sort_by", params.sort_by);
    if (params?.sort_order) queryParams.append("sort_order", params.sort_order);

    const queryString = queryParams.toString();
    const endpoint = `/v1/dictionary/countries${queryString ? `?${queryString}` : ""}`;

    const response = await apiClient.get<Country[] | { countries: Country[] }>(endpoint, {
      headers: {
        "Accept-Language": language,
      },
    });
    return normalizeArrayResponse<Country>(response);
  },

  /**
   * Получить список городов для страны
   * @param countryCode - Код страны (например, KZ) - обязательный параметр
   * @param language - Язык для переводов (ru-RU, kk-KZ, en-US)
   * @param params - Параметры пагинации, фильтрации и сортировки
   */
  getCities: async (
    countryCode: string,
    language: string = "ru-RU",
    params?: {
      page?: number;
      limit?: number;
      search?: string;
      sort_by?: string;
      sort_order?: "asc" | "desc";
    }
  ): Promise<City[]> => {
    const queryParams = new URLSearchParams();
    queryParams.append("country_code", countryCode);
    if (params?.page) queryParams.append("page", String(params.page));
    if (params?.limit) queryParams.append("limit", String(params.limit));
    if (params?.search) queryParams.append("search", params.search);
    if (params?.sort_by) queryParams.append("sort_by", params.sort_by);
    if (params?.sort_order) queryParams.append("sort_order", params.sort_order);

    const queryString = queryParams.toString();
    const endpoint = `/v1/dictionary/cities?${queryString}`;

    const response = await apiClient.get<City[] | { cities: City[] }>(endpoint, {
      headers: {
        "Accept-Language": language,
      },
    });
    return normalizeArrayResponse<City>(response);
  },

  /**
   * Получить список языков
   * @param language - Язык для переводов (ru-RU, kk-KZ, en-US)
   */
  getLanguages: async (language: string = "ru-RU"): Promise<Language[]> => {
    const response = await apiClient.get<Language[]>("/v1/dictionary/languages", {
      headers: {
        "Accept-Language": language,
      },
    });
    if (Array.isArray(response)) {
      return response;
    }
    return [];
  },
};

