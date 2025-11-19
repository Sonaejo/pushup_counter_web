'use strict';
const MANIFEST = 'flutter-app-manifest';
const TEMP = 'flutter-temp-cache';
const CACHE_NAME = 'flutter-app-cache';

const RESOURCES = {"assets/AssetManifest.bin": "6679f229f7f363940d14b296b12a9b9b",
"assets/AssetManifest.bin.json": "1b7d8479736c13337ead2edf2f34dacb",
"assets/AssetManifest.json": "4db3a8844057aeecd3f46e8e502d6793",
"assets/assets/gifs/back_kick.gif": "c9259cee97856e50155b79d44cc37f08",
"assets/assets/gifs/bulgarian_split_squat.gif": "d0bf8b787f46d47c2ac47213f809ee72",
"assets/assets/gifs/burpee_jump.gif": "f4559509c9fe5843656627ff71e81f22",
"assets/assets/gifs/decline_pushup.gif": "498b7d96585391b9356b1a750bf6f7e3",
"assets/assets/gifs/front_lunge.gif": "fb2fb419849e7e5d16bf813e02baf3d9",
"assets/assets/gifs/high_plank.png": "223a1d5c28ceba3694a3378ccb090ed1",
"assets/assets/gifs/incline_pushup.gif": "97cb8e57865577c42d9c73773ebf4986",
"assets/assets/gifs/knee_pushup.gif": "79a2fa79ae3300d8c720cd0dd1e1a7a0",
"assets/assets/gifs/legraise.gif": "4a2c838b5ddfc3897601db9e76807509",
"assets/assets/gifs/mountain_climber.gif": "dc505ad8c492bb65cd273e1c844e57fb",
"assets/assets/gifs/narrow_pushup.gif": "c501791a6383afcaa3822e52da7ef3f5",
"assets/assets/gifs/pike_pushup.gif": "66da143eb7437a48434086537959d38b",
"assets/assets/gifs/plank.png": "5efdba25889cd44265f4ea94e96cf633",
"assets/assets/gifs/plank_leg_raise.gif": "a38f959140e38fea624e4d0f808b1a8c",
"assets/assets/gifs/pullup.gif": "1f46b5bccb9392dc076dea8ed55a9e16",
"assets/assets/gifs/pushup.gif": "e81058f72910b594ab54d9b84983d5da",
"assets/assets/gifs/reverse_lunge.gif": "56653161a1e45f48dcade24f88c91046",
"assets/assets/gifs/reverse_plank.png": "a5279cf8129a41bc3c73e4eb0a8e51e1",
"assets/assets/gifs/reverse_pushup.gif": "933d69e747586d12f52a56228bcec63c",
"assets/assets/gifs/side_lunge.gif": "cf0dd11c4595dfd028084d1b71964410",
"assets/assets/gifs/side_plank.png": "90099f1fbd08fa1ae0129bdaef50658b",
"assets/assets/gifs/situp.gif": "cefafe4a1bfedc7e9b887456b1cb89ff",
"assets/assets/gifs/squat.gif": "d863960fd043caf7e7ac38eb5c7d8451",
"assets/assets/gifs/superman.gif": "faad207db0758d9a5a5269d6bfab821a",
"assets/assets/gifs/v_crunch.gif": "abbf415cc7ee68aa068f4880440db65c",
"assets/assets/gifs/wall_handstand.png": "695676e5694286e59d37098875e8227c",
"assets/assets/gifs/widesquat.gif": "a476f84465d1beca82beb8f90f100df6",
"assets/assets/gifs/wrestler_bridge.png": "1707c994ddec11a8faaf5c59d428ab1d",
"assets/assets/images/2.0x/abs_advanced.png": "51a3fbc9e9d2882f6c30cb62f45ac3c8",
"assets/assets/images/2.0x/abs_beginner.png": "cd0a406e2b8fb4ba4e1edaaf82a94d4f",
"assets/assets/images/2.0x/abs_intermediate.png": "d6af3bee24d4e9c96ff8c9219efa850e",
"assets/assets/images/2.0x/arm_advanced.png": "abd5b2f7a478a04709a077de4e7482a2",
"assets/assets/images/2.0x/arm_beginner.png": "4f1b97479ff111990ec38686c8333b51",
"assets/assets/images/2.0x/arm_intermediate.png": "ff6fed1a44dcd40429f5d774d08a9f19",
"assets/assets/images/2.0x/chest_advanced.png": "67a4745b01b011dba89ec8164b47ab6f",
"assets/assets/images/2.0x/chest_beginner.png": "ec1930fd6792af9dbdb6aed1cb291abf",
"assets/assets/images/2.0x/chest_intermediate.png": "5fde203b764acb4516acfe4335368046",
"assets/assets/images/2.0x/core_beginner.png": "4bc74ec6c9faae356cba9dd0d59984bc",
"assets/assets/images/2.0x/core_intermediate.png": "0c66831330432564b5898967ad89496b",
"assets/assets/images/2.0x/gym_squat.png": "2bc5976c4684262dc7b7e3be1e3a997e",
"assets/assets/images/2.0x/leg_advanced.png": "3c55569ca2ed0e25062e6918cd3bbe70",
"assets/assets/images/2.0x/leg_beginner.png": "96a3528fd46891a94727b0f40cb99b51",
"assets/assets/images/2.0x/leg_intermediate.png": "561826497b689f742108876fb7fb4984",
"assets/assets/images/2.0x/tutorial_training.png": "271344c9b5eca196e3545ca713fe7c19",
"assets/assets/images/abs_advanced.png": "51a3fbc9e9d2882f6c30cb62f45ac3c8",
"assets/assets/images/abs_beginner.png": "cd0a406e2b8fb4ba4e1edaaf82a94d4f",
"assets/assets/images/abs_intermediate.png": "d6af3bee24d4e9c96ff8c9219efa850e",
"assets/assets/images/arm_advanced.png": "abd5b2f7a478a04709a077de4e7482a2",
"assets/assets/images/arm_beginner.png": "4f1b97479ff111990ec38686c8333b51",
"assets/assets/images/arm_intermediate.png": "ff6fed1a44dcd40429f5d774d08a9f19",
"assets/assets/images/chest_advanced.png": "67a4745b01b011dba89ec8164b47ab6f",
"assets/assets/images/chest_beginner.png": "ec1930fd6792af9dbdb6aed1cb291abf",
"assets/assets/images/chest_intermediate.png": "5fde203b764acb4516acfe4335368046",
"assets/assets/images/core_advanced.png": "315487cc63d9da3788fa3ab565402e5c",
"assets/assets/images/core_beginner.png": "4bc74ec6c9faae356cba9dd0d59984bc",
"assets/assets/images/core_intermediate.png": "0c66831330432564b5898967ad89496b",
"assets/assets/images/gym_squat.png": "2bc5976c4684262dc7b7e3be1e3a997e",
"assets/assets/images/leg_advanced.png": "3c55569ca2ed0e25062e6918cd3bbe70",
"assets/assets/images/leg_beginner.png": "96a3528fd46891a94727b0f40cb99b51",
"assets/assets/images/leg_intermediate.png": "561826497b689f742108876fb7fb4984",
"assets/assets/images/tutorial_training.png": "271344c9b5eca196e3545ca713fe7c19",
"assets/assets/images/udetate_base.png": "ceef6389e583becde20e666f877a121d",
"assets/assets/report/report.html": "df7e3edf9d457df193f98d9f705c6900",
"assets/assets/report/report.js": "c38eb525e6efc0cf9f3d26fbc50a1d34",
"assets/FontManifest.json": "dc3d03800ccca4601324923c0b1d6d57",
"assets/fonts/MaterialIcons-Regular.otf": "067cff60d4994cff2297fd8fd796ecfa",
"assets/NOTICES": "ae692317ad541445f0e389b0f3f37d96",
"assets/packages/cupertino_icons/assets/CupertinoIcons.ttf": "33b7d9392238c04c131b6ce224e13711",
"assets/shaders/ink_sparkle.frag": "ecc85a2e95f5e9f53123dcaf8cb9b6ce",
"canvaskit/canvaskit.js": "140ccb7d34d0a55065fbd422b843add6",
"canvaskit/canvaskit.js.symbols": "58832fbed59e00d2190aa295c4d70360",
"canvaskit/canvaskit.wasm": "07b9f5853202304d3b0749d9306573cc",
"canvaskit/chromium/canvaskit.js": "5e27aae346eee469027c80af0751d53d",
"canvaskit/chromium/canvaskit.js.symbols": "193deaca1a1424049326d4a91ad1d88d",
"canvaskit/chromium/canvaskit.wasm": "24c77e750a7fa6d474198905249ff506",
"canvaskit/skwasm.js": "1ef3ea3a0fec4569e5d531da25f34095",
"canvaskit/skwasm.js.symbols": "0088242d10d7e7d6d2649d1fe1bda7c1",
"canvaskit/skwasm.wasm": "264db41426307cfc7fa44b95a7772109",
"canvaskit/skwasm_heavy.js": "413f5b2b2d9345f37de148e2544f584f",
"canvaskit/skwasm_heavy.js.symbols": "3c01ec03b5de6d62c34e17014d1decd3",
"canvaskit/skwasm_heavy.wasm": "8034ad26ba2485dab2fd49bdd786837b",
"face_core.js": "3f2b8ad48a3471fbe39c3dce470d3f77",
"face_module.js": "cdf4da13e09f6c5320f254f035ea0f45",
"face_runtime.js": "bd3b5f922d658e8be4c3cf969cbf63f1",
"favicon.png": "5dcef449791fa27946b3d35ad8803796",
"flutter.js": "888483df48293866f9f41d3d9274a779",
"flutter_bootstrap.js": "e2898bf07663d8875817b00c9a3b8dd4",
"icons/Icon-192.png": "ac9a721a12bbc803b44f645561ecb1e1",
"icons/Icon-512.png": "96e752610906ba2a93c65f8abe1645f1",
"icons/Icon-maskable-192.png": "c457ef57daa1d16f64b27b786ec2ea3c",
"icons/Icon-maskable-512.png": "301a7604d45b3e739efc881eb04896ea",
"index.html": "aefbeaacaefe9d00fa57f03a996eca68",
"/": "aefbeaacaefe9d00fa57f03a996eca68",
"main.dart.js": "0bd544605711745536b5224ea9483777",
"manifest.json": "f1f99adcf940253d7fd288aba5eff35f",
"pose.js": "5fb73e008d853304f03b76868386d4db",
"version.json": "971e514f98e97542590fcfd2cada4be3"};
// The application shell files that are downloaded before a service worker can
// start.
const CORE = ["main.dart.js",
"index.html",
"flutter_bootstrap.js",
"assets/AssetManifest.bin.json",
"assets/FontManifest.json"];

// During install, the TEMP cache is populated with the application shell files.
self.addEventListener("install", (event) => {
  self.skipWaiting();
  return event.waitUntil(
    caches.open(TEMP).then((cache) => {
      return cache.addAll(
        CORE.map((value) => new Request(value, {'cache': 'reload'})));
    })
  );
});
// During activate, the cache is populated with the temp files downloaded in
// install. If this service worker is upgrading from one with a saved
// MANIFEST, then use this to retain unchanged resource files.
self.addEventListener("activate", function(event) {
  return event.waitUntil(async function() {
    try {
      var contentCache = await caches.open(CACHE_NAME);
      var tempCache = await caches.open(TEMP);
      var manifestCache = await caches.open(MANIFEST);
      var manifest = await manifestCache.match('manifest');
      // When there is no prior manifest, clear the entire cache.
      if (!manifest) {
        await caches.delete(CACHE_NAME);
        contentCache = await caches.open(CACHE_NAME);
        for (var request of await tempCache.keys()) {
          var response = await tempCache.match(request);
          await contentCache.put(request, response);
        }
        await caches.delete(TEMP);
        // Save the manifest to make future upgrades efficient.
        await manifestCache.put('manifest', new Response(JSON.stringify(RESOURCES)));
        // Claim client to enable caching on first launch
        self.clients.claim();
        return;
      }
      var oldManifest = await manifest.json();
      var origin = self.location.origin;
      for (var request of await contentCache.keys()) {
        var key = request.url.substring(origin.length + 1);
        if (key == "") {
          key = "/";
        }
        // If a resource from the old manifest is not in the new cache, or if
        // the MD5 sum has changed, delete it. Otherwise the resource is left
        // in the cache and can be reused by the new service worker.
        if (!RESOURCES[key] || RESOURCES[key] != oldManifest[key]) {
          await contentCache.delete(request);
        }
      }
      // Populate the cache with the app shell TEMP files, potentially overwriting
      // cache files preserved above.
      for (var request of await tempCache.keys()) {
        var response = await tempCache.match(request);
        await contentCache.put(request, response);
      }
      await caches.delete(TEMP);
      // Save the manifest to make future upgrades efficient.
      await manifestCache.put('manifest', new Response(JSON.stringify(RESOURCES)));
      // Claim client to enable caching on first launch
      self.clients.claim();
      return;
    } catch (err) {
      // On an unhandled exception the state of the cache cannot be guaranteed.
      console.error('Failed to upgrade service worker: ' + err);
      await caches.delete(CACHE_NAME);
      await caches.delete(TEMP);
      await caches.delete(MANIFEST);
    }
  }());
});
// The fetch handler redirects requests for RESOURCE files to the service
// worker cache.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  var origin = self.location.origin;
  var key = event.request.url.substring(origin.length + 1);
  // Redirect URLs to the index.html
  if (key.indexOf('?v=') != -1) {
    key = key.split('?v=')[0];
  }
  if (event.request.url == origin || event.request.url.startsWith(origin + '/#') || key == '') {
    key = '/';
  }
  // If the URL is not the RESOURCE list then return to signal that the
  // browser should take over.
  if (!RESOURCES[key]) {
    return;
  }
  // If the URL is the index.html, perform an online-first request.
  if (key == '/') {
    return onlineFirst(event);
  }
  event.respondWith(caches.open(CACHE_NAME)
    .then((cache) =>  {
      return cache.match(event.request).then((response) => {
        // Either respond with the cached resource, or perform a fetch and
        // lazily populate the cache only if the resource was successfully fetched.
        return response || fetch(event.request).then((response) => {
          if (response && Boolean(response.ok)) {
            cache.put(event.request, response.clone());
          }
          return response;
        });
      })
    })
  );
});
self.addEventListener('message', (event) => {
  // SkipWaiting can be used to immediately activate a waiting service worker.
  // This will also require a page refresh triggered by the main worker.
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
    return;
  }
  if (event.data === 'downloadOffline') {
    downloadOffline();
    return;
  }
});
// Download offline will check the RESOURCES for all files not in the cache
// and populate them.
async function downloadOffline() {
  var resources = [];
  var contentCache = await caches.open(CACHE_NAME);
  var currentContent = {};
  for (var request of await contentCache.keys()) {
    var key = request.url.substring(origin.length + 1);
    if (key == "") {
      key = "/";
    }
    currentContent[key] = true;
  }
  for (var resourceKey of Object.keys(RESOURCES)) {
    if (!currentContent[resourceKey]) {
      resources.push(resourceKey);
    }
  }
  return contentCache.addAll(resources);
}
// Attempt to download the resource online before falling back to
// the offline cache.
function onlineFirst(event) {
  return event.respondWith(
    fetch(event.request).then((response) => {
      return caches.open(CACHE_NAME).then((cache) => {
        cache.put(event.request, response.clone());
        return response;
      });
    }).catch((error) => {
      return caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((response) => {
          if (response != null) {
            return response;
          }
          throw error;
        });
      });
    })
  );
}
