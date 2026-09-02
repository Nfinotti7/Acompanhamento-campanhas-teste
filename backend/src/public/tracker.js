/**
 * Further Analytics & Remarketing Tracker
 * Copie e cole este script no seu site para rastrear origem das campanhas (UTMs, GCLID, FBCLID)
 * e capturar leads automaticamente para suas listas de remarketing.
 */
(function(window) {
  const SCRIPT_HOST = window.FURTHER_API_HOST || 'http://localhost:5000';
  const CLIENT_ID = window.FURTHER_CLIENT_ID || 1;

  function getQueryParams() {
    const params = {};
    const search = window.location.search.substring(1);
    if (!search) return params;
    
    const pairs = search.split('&');
    pairs.forEach(pair => {
      const parts = pair.split('=');
      if (parts[0]) {
        params[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || '');
      }
    });
    return params;
  }

  // Parse and save UTM parameters to sessionStorage
  const q = getQueryParams();
  if (q.utm_source) sessionStorage.setItem('further_utm_source', q.utm_source);
  if (q.utm_medium) sessionStorage.setItem('further_utm_medium', q.utm_medium);
  if (q.utm_campaign) sessionStorage.setItem('further_utm_campaign', q.utm_campaign);
  if (q.utm_content) sessionStorage.setItem('further_utm_content', q.utm_content);
  if (q.gclid) sessionStorage.setItem('further_gclid', q.gclid);
  if (q.fbclid) sessionStorage.setItem('further_fbclid', q.fbclid);

  function getStoredParams() {
    return {
      utm_source: sessionStorage.getItem('further_utm_source') || 'direct',
      utm_medium: sessionStorage.getItem('further_utm_medium') || '',
      utm_campaign: sessionStorage.getItem('further_utm_campaign') || '',
      utm_content: sessionStorage.getItem('further_utm_content') || '',
      gclid: sessionStorage.getItem('further_gclid') || '',
      fbclid: sessionStorage.getItem('further_fbclid') || ''
    };
  }

  // Auto-send pageview event
  function sendPageView() {
    const params = getStoredParams();
    fetch(SCRIPT_HOST + '/api/v1/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        event_name: 'page_view',
        page_url: window.location.href,
        ...params
      })
    }).catch(function(e){});
  }

  // Exposed API
  window.FurtherTracker = {
    captureLead: function(leadData) {
      const params = getStoredParams();
      return fetch(SCRIPT_HOST + '/api/v1/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          ...leadData,
          ...params
        })
      }).then(r => r.json());
    },

    trackConversion: function(eventName, value, email) {
      const params = getStoredParams();
      return fetch(SCRIPT_HOST + '/api/v1/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          event_name: eventName || 'conversion',
          page_url: window.location.href,
          lead_email: email || '',
          conversion_value: value || 0,
          ...params
        })
      }).then(r => r.json());
    }
  };

  sendPageView();
})(window);
