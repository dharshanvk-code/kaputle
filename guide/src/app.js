// What makes the guide behave like an installed app: offline support, and when it's opened from
// the home screen, the logo leads back to the list of guides instead of out to the website.

export const STANDALONE = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export function startApp({ embed = false } = {}) {
  // Automated test browsers skip the service worker unless asked (?sw), so tests always load
  // the files on disk rather than a cached copy.
  const testing = navigator.webdriver && !new URLSearchParams(location.search).has('sw');
  const secure = location.protocol === 'https:' || location.hostname === 'localhost';
  if ('serviceWorker' in navigator && secure && !embed && !testing) {
    navigator.serviceWorker.register('sw.js').catch(() => {}); // without it the guide still works online
  }
  if (STANDALONE) {
    document.documentElement.classList.add('standalone');
    const brand = document.querySelector('.brand');
    if (brand) {
      brand.href = 'library.html';
      brand.title = 'All guides';
    }
  }
}
