import { type App } from "@wasp.sh/spec";

export const head: App["head"] = [
  "<link rel='icon' href='/favicon.ico' sizes='48x48' />",
  "<link rel='icon' href='/favicon.svg' type='image/svg+xml' />",
  "<link rel='apple-touch-icon' href='/apple-touch-icon.png' />",

  "<link rel='preconnect' href='https://fonts.googleapis.com' />",
  "<link rel='preconnect' href='https://fonts.gstatic.com' crossOrigin='anonymous' />",

  "<meta name='description' content='Your apps main description and features.' />",
  "<meta name='author' content='Zavoth' />",
  "<meta name='keywords' content='saas, solution, product, app, service' />",

  "<meta property='og:type' content='website' />",
  "<meta property='og:title' content='Zavoth' />",
  "<meta property='og:site_name' content='Zavoth' />",
  "<meta property='og:url' content='https://your-saas-app.com' />",
  "<meta property='og:description' content='Your apps main description and features.' />",
  "<meta property='og:image' content='https://your-saas-app.com/public-banner.webp' />",
  "<meta name='twitter:image' content='https://your-saas-app.com/public-banner.webp' />",
  "<meta name='twitter:image:width' content='800' />",
  "<meta name='twitter:image:height' content='400' />",
  "<meta name='twitter:card' content='summary_large_image' />",
  // TODO: You can put your Plausible analytics scripts below (https://docs.opensaas.sh/guides/analytics/):
  // NOTE: Plausible does not use Cookies, so you can simply add the scripts here.
  // Google, on the other hand, does, so you must instead add the script dynamically
  // via the Cookie Consent component after the user clicks the "Accept" cookies button.
  "<script async data-domain='<your-site-id>' src='https://plausible.io/js/script.js'></script>", // for production
  "<script async data-domain='<your-site-id>' src='https://plausible.io/js/script.local.js'></script>", // for development
];
