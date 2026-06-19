export interface CategoryModel {
  Order: number | string;
  Name: string;
  Parent: number | string;
  NumberSubDir: number;
  Level: number;
}

const SAMPLE_PAYPOST: CategoryModel[] = [
  { Order: 1, Name: 'Client', Parent: 0, NumberSubDir: 3, Level: 2 },
  { Order: 1.1, Name: 'Counter', Parent: 1, NumberSubDir: 0, Level: 3 },
  { Order: 1.2, Name: 'Manager', Parent: 1, NumberSubDir: 0, Level: 3 },
  { Order: 1.3, Name: 'Center', Parent: 1, NumberSubDir: 0, Level: 3 },
  { Order: 2, Name: 'Core', Parent: 0, NumberSubDir: 3, Level: 2 },
  { Order: 2.1, Name: 'DB', Parent: 2, NumberSubDir: 0, Level: 3 },
  { Order: 2.2, Name: 'CAS', Parent: 2, NumberSubDir: 0, Level: 3 },
  { Order: 2.3, Name: 'Paypost', Parent: 2, NumberSubDir: 0, Level: 3 },
];

const SAMPLE_TOPUP: CategoryModel[] = [
  { Order: 1, Name: 'DB', Parent: 0, NumberSubDir: 2, Level: 2 },
  { Order: 1.1, Name: 'Script', Parent: 1, NumberSubDir: 0, Level: 3 },
  { Order: 1.2, Name: 'PKG', Parent: 1, NumberSubDir: 0, Level: 3 },
  { Order: 2, Name: 'API', Parent: 0, NumberSubDir: 5, Level: 2 },
  { Order: 2.1, Name: 'Topup.Viettel.Api', Parent: 2, NumberSubDir: 0, Level: 3 },
  { Order: 2.2, Name: 'Topup.Viettel.Webview', Parent: 2, NumberSubDir: 0, Level: 3 },
  { Order: 2.3, Name: 'TopupIRIS.CoreAPI', Parent: 2, NumberSubDir: 0, Level: 3 },
  { Order: 2.4, Name: 'TopupIRIS.Gateway', Parent: 2, NumberSubDir: 0, Level: 3 },
  { Order: 2.5, Name: 'TopupIRIS.Backend.Site', Parent: 2, NumberSubDir: 0, Level: 3 },
  { Order: 3, Name: 'TopupIRIS.Inquiry.Service', Parent: 0, NumberSubDir: 0, Level: 2 },
];

const SAMPLE_CAS: CategoryModel[] = [
  { Order: 1, Name: 'CS', Parent: 0, NumberSubDir: 0, Level: 2 },
  { Order: 2, Name: 'WS', Parent: 0, NumberSubDir: 6, Level: 2 },
  { Order: 2.1, Name: 'Account', Parent: 2, NumberSubDir: 0, Level: 3 },
  { Order: 2.2, Name: 'Dll', Parent: 2, NumberSubDir: 0, Level: 3 },
  { Order: 2.3, Name: 'Event', Parent: 2, NumberSubDir: 0, Level: 3 },
  { Order: 2.4, Name: 'Objects', Parent: 2, NumberSubDir: 0, Level: 3 },
  { Order: 2.5, Name: 'Schema', Parent: 2, NumberSubDir: 0, Level: 3 },
  { Order: 2.6, Name: 'Workflows', Parent: 2, NumberSubDir: 0, Level: 3 },
];

export const SAMPLE_HEADER_CONFIGS = [
  { id: 'sample-paypost', name: 'Sample PAYPOST', config: SAMPLE_PAYPOST },
  { id: 'sample-topup', name: 'Sample TOPUP', config: SAMPLE_TOPUP },
  { id: 'sample-cas', name: 'Sample CAS', config: SAMPLE_CAS },
];

export const DEFAULT_HEADER_CONFIG = SAMPLE_TOPUP;
