export const appVersion = '1.0.0';

export const appInfo = {
  name: 'MetaStat',
  nameUC: 'METASTAT',
  logo: 'MetaStat',
  website: 'www.metastat.com',
};

export const applicationBase = {
  name: 'angular-starter',
  angular: 'Angular 19.0.4',
  bootstrap: 'Bootstrap 5.3.3',
  fontawesome: 'Font Awesome 6.7.1',
};
export const environment = {
  appInfo,
  application: {
    ...applicationBase,
    angular: `${applicationBase.angular} DEV`,
    backendAdminUrl: 'http://127.0.0.1:5000/api',
    backendGraphDBUrl: 'http://127.0.0.1:7200',
  },
};
