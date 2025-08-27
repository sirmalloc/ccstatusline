// JavaScript for Automation (JXA) script to read now playing info via
// private MediaRemote.framework using MRNowPlayingRequest.
//
// Returns a simple string: "<title> by <artist>" or an empty string if unavailable.
function run() {
  try {
    ObjC.import('Foundation');

    var bundle = $.NSBundle.bundleWithPath('/System/Library/PrivateFrameworks/MediaRemote.framework/');
    if (!bundle) return '';
    // Load the private framework into the current process (BOOL-returning method exposed as property)
    bundle.load;

    var MRNowPlayingRequest = $.NSClassFromString('MRNowPlayingRequest');
    if (!MRNowPlayingRequest) return '';

    // Obtain now playing item and information
    var item = MRNowPlayingRequest.localNowPlayingItem;
    if (!item) return '';
    var info = item.nowPlayingInfo;
    if (!info) return '';

    // Access title/artist from info dictionary
    var title = info.objectForKey('kMRMediaRemoteNowPlayingInfoTitle') || info.valueForKey('kMRMediaRemoteNowPlayingInfoTitle');
    var artist = info.objectForKey('kMRMediaRemoteNowPlayingInfoArtist') || info.valueForKey('kMRMediaRemoteNowPlayingInfoArtist');

    function u(x) { try { return ObjC.unwrap(x); } catch (e) { return (x || '').toString(); } }
    var t = title ? u(title) : '';
    var a = artist ? u(artist) : '';

    if (t && a) return t + ' by ' + a;
    if (t) return t;
    return '';
  } catch (e) {
    return '';
  }
}
