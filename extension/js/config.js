// No API tokens or credentials are embedded in the extension.
export const WORKER = 'https://vellune-unsplash.vivek-verma-eaf.workers.dev';
export const MODES = ['workspace', 'lounge'];
export const BUNDLED = {
  workspace: {
    id: 'local-workspace', mode: 'workspace', source: 'local', url: 'assets/workspace-default.jpg',
    // The relative asset is resolved by the extension page, not by this module.
    page: 'https://unsplash.com/photos/trees-beside-lake-BSVQsScNJOU', photographer: 'Unsplash contributor'
  },
  lounge: {
    id: 'local-lounge', mode: 'lounge', source: 'local', url: 'assets/lounge-default.jpg',
    page: 'https://unsplash.com/photos/a-large-body-of-water-with-mountains-in-the-background-FFzi-lg9448',
    photographer: 'Edoardo Bortoli', profile: 'https://unsplash.com/@edoa_rdo'
  }
};
// Offline fallback selections are alternate crops/grades of the two credited source photographs.
export const LOCAL_PHOTOS = {
  workspace: [BUNDLED.workspace,
    {...BUNDLED.workspace,id:'local-workspace-a',url:'assets/workspace-alternative-1.jpg'},
    {...BUNDLED.workspace,id:'local-workspace-b',url:'assets/workspace-alternative-2.jpg'}],
  lounge: [BUNDLED.lounge,
    {...BUNDLED.lounge,id:'local-lounge-a',url:'assets/lounge-alternative-1.jpg'},
    {...BUNDLED.lounge,id:'local-lounge-b',url:'assets/lounge-alternative-2.jpg'}]
};
export const STATIONS = {
  // COTN remains the first-choice lounge stream. Its HTTPS radio server uses
  // non-default port 8510, which must be listed explicitly in media-src.
  // The separately credited MP3 fallback is genuine Lo-fi music.
  lofi: { name: 'COTN Radio', style: 'Lounge / chillout', url:'https://streaming.smartradio.ch:8510/stream', site:'https://cotnradio.com/',
    backup:{name:'Kalizo Lo-fi',url:'https://streams.dez.ovh/listen/chillofi/radio.mp3',site:'https://www.kalizoradio.com/radio/lofi/'} },
  jazz: { name: 'RelaxingJazz', style: 'Smooth jazz', url:'https://443-1.autopo.st/171/stream/1/', site:'https://relaxingjazz.com/listen/',
    backup:{name:'RelaxingJazz · low data',url:'https://443-1.autopo.st/171/stream/2/',site:'https://relaxingjazz.com/listen/'} }
};
export const INITIAL = {
  mode:'auto', dayStart:'07:00', loungeStart:'19:00', blur:15, clock24:false,
  weather:true, approximateLocation:true, city:null, jokes:true, radio:true,
  chime:true, chimeVolume:0.85, notifications:false, duration:25,
  station:'jazz', volume:0.55
};
export const FIRST_LINKS = [
  {id:'youtube',name:'YouTube',url:'https://www.youtube.com/'},
  {id:'wikipedia',name:'Wikipedia',url:'https://en.wikipedia.org/'},
  {id:'netflix',name:'Netflix',url:'https://www.netflix.com/'},
  {id:'prime',name:'Prime Video',url:'https://www.primevideo.com/'},
  {id:'x',name:'X',url:'https://x.com/'}
];
