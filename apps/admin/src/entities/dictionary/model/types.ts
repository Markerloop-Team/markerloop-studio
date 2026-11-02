export interface Country {
  code: string;
  name: string; // Название на запрошенном языке
}

export interface City {
  code: string;
  country_code: string;
  name: string; // Название на запрошенном языке
}

export interface Language {
  code: string; // ru-RU, kk-KZ, en-US
  name: string; // Название на запрошенном языке
}

export interface Translation {
  code: string; // Например: country.KZ, city.ALA.KZ
  language: string; // ru, kk, en
  value: string;
  app?: string | null;
}

export interface CountryWithTranslations extends Country {
  translations: {
    ru?: string;
    kk?: string;
    en?: string;
  };
}

export interface CityWithTranslations extends City {
  translations: {
    ru?: string;
    kk?: string;
    en?: string;
  };
}

export interface CountriesResponse {
  countries: Country[];
  count: number;
  total: number;
  page?: number;
  limit?: number;
}

export interface CountriesResponseWithMeta {
  data: CountriesResponse;
  meta?: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface CitiesResponse {
  cities: City[];
  count: number;
  total: number;
  page?: number;
  limit?: number;
}

export interface CitiesResponseWithMeta {
  data: CitiesResponse;
  meta?: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

