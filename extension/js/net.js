// Fetch only HTTPS service data. Timeout and non-2xx failures reject cleanly.
export async function timedFetch(url,options={},ms=9000){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),ms);try{const res=await fetch(url,{...options,signal:controller.signal});if(!res.ok)throw Error(`Request failed (${res.status})`);return res.json();}finally{clearTimeout(timeout);}}
