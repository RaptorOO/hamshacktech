/* =====================================================================
   Morse Code Jeopardy -- answers made by rules (Tim, 2026-10-23)

   Players were starting to see the same answers again (each category
   used to be a fixed list of 22 to 70). Now every category is made up
   fresh every game, by rules. (Q-Signals and Ham Talk were lists; Movies
   and Music took their places.)

     NUMBERS     3-, 4- and 5-digit numbers, signal reports (599, RST 579,
                 UR RST 449), temperatures (78F, 21C, TEMP 68, TEMP IS 68,
                 WX 72F -- no ES: in CW, ES means "and") and times
                 (11AM, 1PM, 1830Z -- no colons: students don't learn it)
     CALL SIGNS  the same rules as the Code Groups trainer's Call Signs
                 (code-groups/index.html): FCC 1x2 / 2x2 / 2x3 formats,
                 UK and other DX formats; about 3 in 4 US
     NAMES       first names, cars and historic places, 6 letters at most
                 (the name itself), alone or as on-the-air phrases
                 (NAME BOB, OP IS SUE, YL ANN)
     QTHS        US cities and states, countries, world cities, Canadian
                 provinces and grid squares, alone or as phrases
                 (QTH DENVER CO, NR BOSTON, QTH IS OHIO, GRID FN42)
     MOVIES      titles, actors, characters and movie words, at most
                 9 letters and numbers (spaces don't count)
     MUSIC       artists, styles, song titles and music words, at most
                 12 letters and numbers (FRANK SINATRA fits); no lyrics

   Names, places, movies and music have to be real, so those categories pick
   from the built-in lists below and the rules combine them; numbers,
   call signs and grid squares are pure rules. Everything is A-Z, 0-9
   and spaces only (what the room's answer check compares).

     JeopardyAnswers.deal(id, n)   n different answers for a category
     JeopardyAnswers.make(id)      one answer
     JeopardyAnswers.ids           the categories made by rules
   ===================================================================== */
(function () {
  'use strict';

  var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', DIGITS = '0123456789';
  function rnd(n) { return Math.floor(Math.random() * n); }
  function pick(list) { return list[rnd(list.length)]; }
  function between(lo, hi) { return lo + rnd(hi - lo + 1); }
  function letters(n) { var s = ''; for (var i = 0; i < n; i++) s += pick(ALPHA); return s; }
  // Choose by weight: [[weight, value], ...]
  function weighted(pairs) {
    var total = pairs.reduce(function (a, p) { return a + p[0]; }, 0), x = Math.random() * total;
    for (var i = 0; i < pairs.length; i++) { x -= pairs[i][0]; if (x < 0) return pairs[i][1]; }
    return pairs[pairs.length - 1][1];
  }
  function words(s) { return s.split(/\s*,\s*/).filter(Boolean); }

  /* ---------------- NUMBERS ---------------- */
  function plainNumber() {
    return String(weighted([[4, function () { return between(100, 999); }],
                            [3, function () { return between(1000, 9999); }],
                            [2, function () { return between(10000, 99999); }]])());
  }
  // Signal reports: Readability 1-5, Strength 1-9, Tone 1-9, weighted the
  // way they're really given (mostly 5s and 9s, never a silly 111).
  function rst() {
    var r = weighted([[6, 5], [3, 4], [1, 3]]);
    var s = weighted([[5, 9], [4, 8], [4, 7], [3, 6], [3, 5], [2, 4], [1, 3]]);
    var t = weighted([[8, 9], [1, 8], [1, 7]]);
    var rep = '' + r + s + t;
    return weighted([[3, rep], [4, 'RST ' + rep], [2, 'UR RST ' + rep], [1, 'UR ' + rep]]);
  }
  function temperature() {
    var f = between(5, 104), c = between(1, 40);
    return weighted([[3, f + 'F'], [2, c + 'C'], [2, 'TEMP ' + f], [2, 'TEMP IS ' + f],
                     [2, 'WX ' + f + 'F'], [1, 'TEMP ' + f + 'F'], [1, 'TEMP ' + c + 'C']]);
  }
  function time() {
    if (Math.random() < 0.7) return between(1, 12) + (Math.random() < 0.5 ? 'AM' : 'PM');
    // UTC, as sent on the air: 4 digits and Z
    return ('0' + between(0, 23)).slice(-2) + pick(['00', '00', '15', '30', '45']) + 'Z';
  }
  function number() {
    return weighted([[9, plainNumber], [5, rst], [3, temperature], [3, time]])();
  }

  /* ---------------- CALL SIGNS ----------------
     The Code Groups trainer's rules (code-groups/index.html,
     usCallSign / ukCallSign / intlCallSign), kept the same here. */
  function range2(a, from, to) {
    var out = [];
    for (var c = from.charCodeAt(0); c <= to.charCodeAt(0); c++) out.push(a + String.fromCharCode(c));
    return out;
  }
  // US formats, named the way the FCC names them: 1x2 = K6AB, 2x2 = KA6AB, 2x3 = KA6ABC.
  //   1x2 -> K, N, W   2x2 -> AA-AL, KA-KZ, NA-NZ, WA-WZ   2x3 -> KA-KZ, NA-NZ, WA-WZ
  var US_2X2 = range2('A', 'A', 'L').concat(range2('K', 'A', 'Z'), range2('N', 'A', 'Z'), range2('W', 'A', 'Z'));
  var US_2X3 = range2('K', 'A', 'Z').concat(range2('N', 'A', 'Z'), range2('W', 'A', 'Z'));
  function usCallSign() {
    var fmt = pick(['1x2', '2x2', '2x3']), digit = pick(DIGITS);
    if (fmt === '1x2') return pick(['K', 'N', 'W']) + digit + letters(2);
    if (fmt === '2x2') return pick(US_2X2) + digit + letters(2);
    var first;                       // the FCC doesn't issue 2x3 suffixes starting with Q
    do { first = pick(ALPHA); } while (first === 'Q');
    return pick(US_2X3) + digit + first + letters(2);
  }
  // UK: G + digit + 3 letters (older G2/G3/G4 may have 2), M + 0/1/3/6/7 + 3,
  // 2E + 0/1 + 3, with a regional letter (M Scotland, W Wales, I N. Ireland,
  // D Isle of Man, J Jersey, U Guernsey) half the time.
  function ukCallSign() {
    var region = Math.random() < 0.5 ? '' : pick(['M', 'W', 'I', 'D', 'J', 'U']);
    var series = pick(['G', 'M', '2']);
    if (series === 'G') {
      var gDigit = pick(['0', '1', '2', '3', '4', '6', '7', '8']);
      var gLen = (gDigit === '2' || gDigit === '3' || gDigit === '4') && Math.random() < 0.3 ? 2 : 3;
      return 'G' + region + gDigit + letters(gLen);
    }
    if (series === 'M') return 'M' + region + pick(['0', '1', '3', '6', '7']) + letters(3);
    return '2' + (region || 'E') + pick(['0', '1']) + letters(3);
  }
  var INTL = [
    [['VE', 'VA'], '123456789', [2, 3]],                       // Canada
    [['DL', 'DJ', 'DK', 'DF', 'DO'], '123456789', [2, 3]],     // Germany
    [['JA', 'JH', 'JR', 'JE', 'JF', 'JG', '7K'], '0123456789', [3]],   // Japan
    [['VK'], '12345678', [2, 3]],                               // Australia
    [['ZL'], '1234', [2, 3]],                                   // New Zealand
    [['I', 'IK', 'IZ', 'IW'], '0123456789', [2, 3]],            // Italy
    [['F'], '14568', [3]],                                      // France
    [['EA', 'EB', 'EC'], '123456789', [2, 3]],                  // Spain
    [['PA', 'PD', 'PE', 'PH'], '0123456789', [2, 3]],           // Netherlands
    [['PY', 'PU'], '123456789', [2, 3]]                         // Brazil
  ];
  function intlCallSign() {
    if (Math.random() < 0.4) return ukCallSign();
    var f = pick(INTL);
    return pick(f[0]) + pick(f[1].split('')) + letters(pick(f[2]));
  }
  function callSign() {
    var call;
    do { call = Math.random() < 0.75 ? usCallSign() : intlCallSign(); } while (call.indexOf('SOS') >= 0);
    return call;
  }

  /* ---------------- NAMES (6 letters at most) ---------------- */
  var MEN = words('AL, ALAN, ALBERT, ALEX, ANDY, ARNOLD, ART, BARRY, BEN, BERT, BILL, BILLY, BOB, BOBBY, BRAD, BRIAN, BRUCE, BUD, CARL, ' +
    'CHAD, CHARLIE, CHRIS, CHUCK, CLAY, CLIFF, COLIN, CRAIG, DALE, DAN, DANNY, DAVE, DAVID, DEAN, DEREK, DON, DOUG, DUANE, DWIGHT, ' +
    'EARL, ED, EDDIE, ELI, ELMER, ERIC, ERNIE, EVAN, FRANK, FRED, GARY, GENE, GEORGE, GLEN, GORDON, GRANT, GREG, GUS, HAL, HANK, ' +
    'HARRY, HENRY, HERB, HOMER, HOWARD, HUGH, IAN, IVAN, JACK, JAKE, JAMES, JASON, JAY, JEFF, JERRY, JESSE, JIM, JIMMY, JOE, JOEL, ' +
    'JOHN, JON, JOSH, JUAN, KARL, KEITH, KEN, KENNY, KEVIN, KIRK, KURT, KYLE, LANCE, LARRY, LEE, LEO, LEON, LES, LEWIS, LLOYD, ' +
    'LOUIS, LUKE, MARK, MARTY, MATT, MAX, MEL, MIKE, MILES, MILT, MORRIS, MURRAY, NATE, NED, NEIL, NICK, NOAH, NORM, OSCAR, OTTO, ' +
    'OWEN, PAUL, PERRY, PETE, PETER, PHIL, RALPH, RANDY, RAY, REX, RICH, RICK, ROB, ROGER, RON, ROSS, ROY, RUSS, RYAN, SAM, SCOTT, ' +
    'SETH, SID, SIMON, STAN, STEVE, STU, TED, TERRY, TIM, TODD, TOM, TONY, TRAVIS, TROY, VERN, VIC, VINCE, WADE, WALLY, WALT, ' +
    'WARREN, WAYNE, WES, WILL, ZACH').filter(function (n) { return n.length <= 6; });
  var WOMEN = words('ABBY, ADA, ALICE, ALMA, AMY, ANGELA, ANITA, ANN, ANNA, ANNE, APRIL, AUDREY, BARB, BEA, BECKY, BETH, BETTY, ' +
    'BONNIE, BRENDA, CARLA, CAROL, CATHY, CINDY, CLARA, CONNIE, DAISY, DAWN, DEB, DEBBIE, DELLA, DIANA, DIANE, DONNA, DORIS, DOT, ' +
    'EDNA, EILEEN, ELLA, ELLEN, ELSIE, EMILY, EMMA, ERIN, ESTHER, ETHEL, EVA, EVE, FAYE, FLO, FRAN, GAIL, GINA, GLORIA, GRACE, ' +
    'HAZEL, HEIDI, HELEN, HOLLY, IDA, IRENE, IRIS, IVY, JAN, JANE, JANET, JEAN, JENNY, JESS, JILL, JOAN, JODY, JOY, JUDY, JULIA, ' +
    'JUNE, KAREN, KATE, KATHY, KAY, KELLY, KIM, LAURA, LEAH, LILY, LINDA, LISA, LIZ, LOIS, LORI, LUCY, LYNN, MABEL, MAE, MAGGIE, ' +
    'MARCIA, MARGE, MARIA, MARIE, MARY, MAUD, MAY, MEG, MOLLY, NANCY, NELL, NINA, NORA, OLIVE, PAM, PAT, PATSY, PAULA, PEARL, ' +
    'PEG, PEGGY, PENNY, POLLY, RITA, ROBIN, ROSE, ROSIE, RUBY, RUTH, SALLY, SARA, SARAH, SHARON, SHEILA, SUE, SUSAN, SUSIE, TAMMY, ' +
    'TERRI, TINA, TRACY, TRUDY, VERA, VICKI, VIOLA, WANDA, WENDY, ZOE').filter(function (n) { return n.length <= 6; });
  var CARS = words('ACCORD, ACURA, AUDI, BEETLE, BMW, BOLT, BRONCO, BUICK, CAMARO, CAMRY, CIVIC, CORSA, CRV, DODGE, EDGE, ESCAPE, ' +
    'FIAT, FIESTA, FOCUS, FORD, FORTE, GOLF, HONDA, HUMMER, IMPALA, JAGUAR, JEEP, JETTA, KIA, KONA, LEAF, LEXUS, LOTUS, MALIBU, ' +
    'MAZDA, MIATA, MINI, MODEL T, NISSAN, NOVA, OPTIMA, PASSAT, PILOT, PINTO, PRIUS, RAM, RAV4, RIO, ROGUE, SAAB, SENTRA, SIENNA, ' +
    'SONATA, SONIC, SOUL, SPARK, SUBARU, TACOMA, TAHOE, TESLA, TOYOTA, TUCSON, TUNDRA, VOLT, VOLVO, YARIS');
  var PLACES = words('ALAMO, ANGKOR, AXUM, BIG BEN, DELPHI, ELLIS, GIZA, ITHACA, KARNAK, LOUVRE, LUXOR, MASADA, PETRA, PISA, ' +
    'ROME, SPARTA, SPHINX, TAJ, TIKAL, TROY');
  function nameOnly(n) { return n.replace(/ /g, '').length <= 6; }
  function name() {
    var kind = weighted([[7, 'person'], [2, 'car'], [1, 'place']]);
    if (kind === 'car') return pick(CARS);
    if (kind === 'place') return pick(PLACES);
    var man = Math.random() < 0.55, n = pick(man ? MEN : WOMEN);
    // About half the time, the way a name comes up in a contact.
    if (Math.random() < 0.5) return n;
    return weighted([[3, 'NAME ' + n], [2, 'OP IS ' + n], [2, 'OP ' + n], [1, 'NAME HR ' + n],
                     [1, 'NAME IS ' + n], [2, (man ? 'OM ' : 'YL ') + n]]);
  }

  /* ---------------- QTHS ---------------- */
  var US_CITIES = [
    ['AKRON', 'OH'], ['ALBANY', 'NY'], ['AMARILLO', 'TX'], ['ANAHEIM', 'CA'], ['ANCHORAGE', 'AK'], ['ATLANTA', 'GA'], ['AUGUSTA', 'GA'],
    ['AUSTIN', 'TX'], ['BALTIMORE', 'MD'], ['BANGOR', 'ME'], ['BILLINGS', 'MT'], ['BISMARCK', 'ND'], ['BOISE', 'ID'], ['BOSTON', 'MA'],
    ['BOULDER', 'CO'], ['BOZEMAN', 'MT'], ['BUFFALO', 'NY'], ['BURLINGTON', 'VT'], ['BUTTE', 'MT'], ['CANTON', 'OH'], ['CASPER', 'WY'],
    ['CHARLOTTE', 'NC'], ['CHEYENNE', 'WY'], ['CHICAGO', 'IL'], ['CLEVELAND', 'OH'], ['COLUMBUS', 'OH'], ['CONCORD', 'NH'],
    ['DALLAS', 'TX'], ['DAYTON', 'OH'], ['DENVER', 'CO'], ['DETROIT', 'MI'], ['DOVER', 'DE'], ['DULUTH', 'MN'], ['DURHAM', 'NC'],
    ['ERIE', 'PA'], ['EUGENE', 'OR'], ['FAIRBANKS', 'AK'], ['FARGO', 'ND'], ['FLINT', 'MI'], ['FRESNO', 'CA'], ['GALVESTON', 'TX'],
    ['HARTFORD', 'CT'], ['HELENA', 'MT'], ['HILO', 'HI'], ['HONOLULU', 'HI'], ['HOUSTON', 'TX'], ['IRVINE', 'CA'], ['JACKSON', 'MS'],
    ['JUNEAU', 'AK'], ['KEENE', 'NH'], ['KNOXVILLE', 'TN'], ['LANSING', 'MI'], ['LAREDO', 'TX'], ['LINCOLN', 'NE'], ['LUBBOCK', 'TX'],
    ['MACON', 'GA'], ['MADISON', 'WI'], ['MEMPHIS', 'TN'], ['MESA', 'AZ'], ['MIAMI', 'FL'], ['MILWAUKEE', 'WI'], ['MOBILE', 'AL'],
    ['MONTEREY', 'CA'], ['NAPA', 'CA'], ['NASHVILLE', 'TN'], ['NEWARK', 'NJ'], ['NORFOLK', 'VA'], ['OAKLAND', 'CA'], ['OGDEN', 'UT'],
    ['OMAHA', 'NE'], ['ORLANDO', 'FL'], ['PASADENA', 'CA'], ['PEORIA', 'IL'], ['PHOENIX', 'AZ'], ['PORTLAND', 'OR'], ['PROVO', 'UT'],
    ['RALEIGH', 'NC'], ['RENO', 'NV'], ['RICHMOND', 'VA'], ['ROANOKE', 'VA'], ['ROCHESTER', 'NY'], ['SALEM', 'OR'], ['SAVANNAH', 'GA'],
    ['SEATTLE', 'WA'], ['SPOKANE', 'WA'], ['TACOMA', 'WA'], ['TAMPA', 'FL'], ['TEMPE', 'AZ'], ['TOLEDO', 'OH'], ['TOPEKA', 'KS'],
    ['TRENTON', 'NJ'], ['TUCSON', 'AZ'], ['TULSA', 'OK'], ['WACO', 'TX'], ['WICHITA', 'KS'], ['YAKIMA', 'WA'], ['YUMA', 'AZ'],
    ['EL PASO', 'TX'], ['SANTA FE', 'NM'], ['LAS VEGAS', 'NV'], ['SAN DIEGO', 'CA'], ['GREEN BAY', 'WI'], ['KEY WEST', 'FL']
  ];
  var STATES = words('ALABAMA, ALASKA, ARIZONA, ARKANSAS, COLORADO, DELAWARE, FLORIDA, GEORGIA, HAWAII, IDAHO, ILLINOIS, INDIANA, ' +
    'IOWA, KANSAS, KENTUCKY, LOUISIANA, MAINE, MARYLAND, MICHIGAN, MINNESOTA, MISSOURI, MONTANA, NEBRASKA, NEVADA, NEW JERSEY, ' +
    'NEW MEXICO, NEW YORK, OHIO, OKLAHOMA, OREGON, TEXAS, UTAH, VERMONT, VIRGINIA, WISCONSIN, WYOMING');
  var STATE_ABBR = words('AL, AK, AZ, AR, CA, CO, CT, DE, FL, GA, HI, ID, IL, IN, IA, KS, KY, LA, ME, MD, MA, MI, MN, MS, MO, MT, ' +
    'NE, NV, NH, NJ, NM, NY, NC, ND, OH, OK, OR, PA, RI, SC, SD, TN, TX, UT, VT, VA, WA, WV, WI, WY');
  var COUNTRIES = words('ARGENTINA, AUSTRALIA, AUSTRIA, BELGIUM, BRAZIL, CANADA, CHILE, CHINA, CROATIA, CUBA, CYPRUS, DENMARK, ' +
    'EGYPT, ENGLAND, ESTONIA, FIJI, FINLAND, FRANCE, GERMANY, GHANA, GREECE, HUNGARY, ICELAND, INDIA, IRELAND, ISRAEL, ITALY, ' +
    'JAMAICA, JAPAN, JORDAN, KENYA, KOREA, LATVIA, MALTA, MEXICO, MOROCCO, NEPAL, NORWAY, PANAMA, PERU, POLAND, PORTUGAL, ' +
    'ROMANIA, SAMOA, SCOTLAND, SERBIA, SPAIN, SWEDEN, THAILAND, TONGA, TURKEY, UKRAINE, URUGUAY, VIETNAM, WALES');
  var WORLD_CITIES = words('ATHENS, AUCKLAND, BANGKOK, BEIJING, BERLIN, BOGOTA, BUDAPEST, CAIRO, CALGARY, DELHI, DUBAI, DUBLIN, ' +
    'GENEVA, HANOI, HAVANA, HELSINKI, ISTANBUL, KYIV, LIMA, LISBON, LONDON, MADRID, MANILA, MONTREAL, MOSCOW, MUMBAI, NAIROBI, ' +
    'OSAKA, OSLO, OTTAWA, PARIS, PERTH, PRAGUE, QUEBEC, QUITO, ROME, SANTIAGO, SEOUL, SYDNEY, TOKYO, TORONTO, VANCOUVER, VENICE, ' +
    'VIENNA, WARSAW');
  // (SK left out: it's also the end-of-contact prosign.)
  var PROVINCES = words('ON, QC, BC, AB, MB, NS, NB, NL, PE');
  // Maidenhead grid squares: field AA-RR + square 00-99. Mostly the North
  // American fields, so they look like grids heard on the air.
  function grid() {
    var field = Math.random() < 0.7 ? pick(words('CM, CN, DM, DN, EL, EM, EN, FM, FN, FN, EM, DM'))
                                    : pick('ABCDEFGHIJKLMNOPQR') + pick('ABCDEFGHIJKLMNOPQR');
    return field + rnd(10) + rnd(10);
  }
  function qth() {
    return weighted([
      [5, function () { var c = pick(US_CITIES);
        return weighted([[3, c[0]], [3, c[0] + ' ' + c[1]], [2, 'QTH ' + c[0]], [2, 'QTH ' + c[0] + ' ' + c[1]], [1, 'NR ' + c[0]]]); }],
      [2, function () { var s = pick(STATES); return weighted([[3, s], [2, 'QTH ' + s], [1, 'QTH IS ' + s]]); }],
      [1, function () { return 'QTH ' + pick(STATE_ABBR); }],
      [2, function () { var c = pick(COUNTRIES); return weighted([[3, c], [1, 'QTH ' + c]]); }],
      [2, function () { var c = pick(WORLD_CITIES); return weighted([[3, c], [1, 'QTH ' + c], [1, 'NR ' + c]]); }],
      [1, function () { return 'QTH ' + pick(PROVINCES); }],
      [1, function () { return weighted([[2, grid()], [2, 'GRID ' + grid()], [1, 'QTH ' + grid()]]); }]
    ])();
  }

  /* ---------------- MOVIES (9 letters and numbers at most) ---------------- */
  var MOVIE_TITLES = words('AIRPLANE, ALADDIN, ALIEN, ALIENS, AMADEUS, ANNIE, ARGO, AVATAR, BABE, BAMBI, BARBIE, BATMAN, BEN HUR, ' +
    'BIG, BRAVE, CABARET, CARRIE, CARS, CASPER, CHICAGO, CLUE, COCO, CONTACT, CRASH, DUMBO, DUNE, ELF, ELVIS, ENCANTO, ET, ' +
    'FARGO, FROZEN, FURY, GANDHI, GET OUT, GHOST, GIANT, GIGI, GLADIATOR, GODZILLA, GREASE, HAIRSPRAY, HALLOWEEN, HEAT, HER, ' +
    'HIGH NOON, HOME ALONE, HOOK, HULK, IRON MAN, IT, JAWS, JOKER, JUNO, KING KONG, MISERY, MOANA, MULAN, NOPE, OLIVER, PATTON, ' +
    'PSYCHO, ROCKY, ROCKETMAN, SCREAM, SHANE, SHREK, SIGNS, SPEED, SPLASH, STAR WARS, SUPERMAN, TANGLED, TENET, THOR, TITANIC, ' +
    'TOOTSIE, TOP GUN, TOY STORY, TWISTER, UP, VERTIGO, WALL E, WICKED, ZOOTOPIA, ' +
    'AMELIE, ANNIE HALL, ANT MAN, AQUAMAN, BAD BOYS, BIG FISH, BLADE, BOLT, BOYHOOD, BULLITT, CAPOTE, CASINO, CATWOMAN, ' +
    'CHINATOWN, CLERKS, COCOON, CONCLAVE, CORALINE, CREED, CUJO, CYRANO, DEADPOOL, DIE HARD, DOLITTLE, DRIVE, DUNKIRK, ELEKTRA, ' +
    'ERASER, EVITA, FACE OFF, FAME, FANTASIA, FLUBBER, FOOTLOOSE, FRIDA, GATTACA, GRAVITY, GREMLINS, HAMLET, HANCOCK, HAPPY FEET, ' +
    'HELLBOY, HERBIE, HERCULES, HITCH, HOOSIERS, HUGO, INCEPTION, INSIDE OUT, JUMANJI, KINGPIN, LABYRINTH, LINCOLN, LOGAN, LOOPER, ' +
    'LUCA, MARTY, MAVERICK, MEAN GIRLS, MEGAMIND, MEMENTO, MILK, MINIONS, MONEYBALL, NETWORK, OKLAHOMA, ONWARD, PAPILLON, PARASITE, ' +
    'PINOCCHIO, PLATOON, PREDATOR, RANGO, REBECCA, ROBIN HOOD, ROBOCOP, ROOM, RUDY, SABRINA, SAW, SCARFACE, SELMA, SEVEN, SHAFT, ' +
    'SHAZAM, SICARIO, SING, SKYFALL, SLEEPER, SNATCH, SOUL, SPACE JAM, SPARTACUS, SPOTLIGHT, SPY, STRIPES, SUPERBAD, TED, THE BIRDS, ' +
    'THE FLASH, THE MATRIX, THE MUMMY, THE ROCK, THE THING, TOMBSTONE, TRON, TROY, TWILIGHT, VENOM, WHIPLASH, WILLOW, WITNESS, ' +
    'WONKA, X MEN, YENTL, ZELIG, ZODIAC');
  var ACTORS = words('AFFLECK, ASTAIRE, BOGART, BRAD PITT, BULLOCK, CHAPLIN, CHER, CLOONEY, DAMON, DE NIRO, DENZEL, EASTWOOD, FONDA, ' +
    'GABLE, GARBO, GRANT, HEPBURN, HOFFMAN, JIM CARREY, JOHN WAYNE, KEATON, KIDMAN, MEL GIBSON, MONROE, NEWMAN, NICHOLSON, PACINO, ' +
    'PFEIFFER, REDFORD, ROBERTS, SINATRA, STALLONE, STEWART, STREEP, TOM CRUISE, TOM HANKS, WILL SMITH, ' +
    'ADAMS, AL PACINO, ALBA, ALDA, ANISTON, AYKROYD, BACALL, BALE, BERRY, BLANCHETT, BOB HOPE, BRANDO, BRIDGES, CAGE, CAINE, CANDY, ' +
    'CARELL, COOPER, COSTNER, CRAIG, CROWE, CRUZ, CURTIS, DAVIS, DEAN, DEMI MOORE, DEPP, DERN, DIAZ, DORIS DAY, DOUGLAS, DUVALL, ' +
    'ED HARRIS, FIELD, FORD, FOSTER, FOX, FREEMAN, GARLAND, GERE, GOLDBERG, GOSLING, HACKMAN, HARDY, HAWN, HAYEK, HESTON, HOPKINS, ' +
    'HUDSON, HUNT, JACKMAN, JOHANSSON, JOLIE, KEANU, KELLY, KINGSLEY, LANCASTER, LANGE, LAUREL, LEMMON, LIZ TAYLOR, LOREN, MARVIN, ' +
    'MCQUEEN, MEG RYAN, MIRREN, MOORE, MURPHY, MURRAY, NEESON, NOLTE, PECK, PENN, PHOENIX, POITIER, PORTMAN, QUAID, REEVES, ' +
    'SARANDON, SEAN PENN, SELLECK, SPACEK, STONE, SWAYZE, TAYLOR, THERON, TIM ALLEN, TRAVOLTA, TURNER, WAYNE, WEAVER, WELCH, ' +
    'WILDER, WILLIS, WINSLET, WOOD');
  var CHARACTERS = words('ARIEL, BILBO, BOND, BUZZ, C3PO, CHEWBACCA, DONKEY, DORY, DRACULA, ELLIOTT, ELSA, FIONA, FRODO, GANDALF, ' +
    'GOLLUM, GRINCH, GROOT, GUMP, HAN SOLO, INDY, JAMES BOND, KONG, LEIA, LUKE, MOWGLI, NEMO, NEO, OLAF, POPPINS, R2D2, RAMBO, ' +
    'SIMBA, TARZAN, VADER, WOODY, YODA, ZORRO, ' +
    'ANAKIN, ANNA, ARAGORN, BAGHEERA, BALOO, BELLE, BOO, BUMBLEBEE, CHESHIRE, CRUELLA, DASH, DOROTHY, EDNA, EEYORE, FLIK, FROZONE, ' +
    'GENIE, GEPPETTO, GOOFY, HAGRID, HERMIONE, JABBA, JAFAR, JASMINE, JESSIE, KAA, KERMIT, KRISTOFF, LADY, MARLIN, MAUI, MERLIN, ' +
    'MICKEY, MINNIE, MUFASA, NALA, OBI WAN, PADME, PIGLET, PONGO, POOH, POPEYE, PUMBAA, RAPUNZEL, REMY, REY, RIPLEY, ROO, SCAR, ' +
    'SHERE KHAN, SNOW WHITE, SPOCK, STITCH, SULLEY, SVEN, THUMPER, TIGGER, TIMON, TOTO, TRAMP, TRINITY, URSULA, VIOLET, ZURG');
  var MOVIE_WORDS = words('ACTION, BLOOPER, CAMEO, CINEMA, CREDITS, CUT, DIRECTOR, DVD, FILM, HOLLYWOOD, IMAX, MATINEE, MOVIE, ' +
    'OSCAR, POPCORN, PREMIERE, REMAKE, SCENE, SCREEN, SCRIPT, SEQUEL, STUNTMAN, TICKET, TRAILER, VHS, ' +
    'ACTOR, ACTRESS, AGENT, AUDIENCE, AWARD, BOX OFFICE, CAMERA, CAST, CLAPPER, CLOSE UP, COMEDY, CRITIC, DRAMA, DRIVE IN, EDITOR, ' +
    'EPIC, EXTRA, FADE OUT, FLASHBACK, GENRE, GRIP, HERO, HORROR, LEAD, LOCATION, MONTAGE, MUSICAL, NOIR, PLOT, PREQUEL, PRODUCER, ' +
    'PROP, RATING, REEL, REVIEW, ROLE, ROMANCE, SCORE, SET, SPOILER, STAR, STUDIO, STUNT, SUBTITLE, TAKE, TALKIE, THRILLER, USHER, ' +
    'VILLAIN, WESTERN, ZOOM');
  function movie() {
    return pick(weighted([[4, MOVIE_TITLES], [2, ACTORS], [3, CHARACTERS], [1, MOVIE_WORDS]]));
  }

  /* ---------------- MUSIC (12 letters and numbers at most) ----------------
     Artists, styles, song titles and music words. No lyrics: those are
     copyrighted, so titles stand in for them. */
  var ARTISTS = words('ABBA, ADELE, AEROSMITH, AL GREEN, ARETHA, BACH, BARRY MANILOW, BB KING, BEACH BOYS, BEATLES, BEE GEES, ' +
    'BEETHOVEN, BERNSTEIN, BEYONCE, BILLY JOEL, BING CROSBY, BLACKPINK, BLONDIE, BLUR, BOB DYLAN, BOB MARLEY, BON JOVI, BONO, ' +
    'BOSTON, BRAHMS, BTS, BUDDY HOLLY, CARPENTERS, CELINE DION, CHER, CHICAGO, CHOPIN, CHUCK BERRY, COLDPLAY, COLTRANE, COPLAND, ' +
    'CREAM, DEAN MARTIN, DEBUSSY, DEF LEPPARD, DEVO, DOLLY PARTON, DRAKE, EAGLES, ELGAR, ELTON JOHN, ELVIS, EMINEM, FATS DOMINO, ' +
    'FLEETWOOD MAC, FOO FIGHTERS, GARTH BROOKS, GENESIS, GERSHWIN, GREEN DAY, HANDEL, HAYDN, HEART, JACKSON FIVE, JANIS JOPLIN, ' +
    'JAY Z, JIMI HENDRIX, JOHNNY CASH, JOURNEY, KANYE, KEANE, KISS, KORN, LED ZEPPELIN, LIONEL RICHIE, LISZT, LORDE, MADONNA, ' +
    'MARIAH CAREY, METALLICA, MILES DAVIS, MONKEES, MOZART, MUDDY WATERS, MUSE, NAT KING COLE, NEIL DIAMOND, NIRVANA, OASIS, ' +
    'OUTKAST, OZZY, PATSY CLINE, PEARL JAM, PERRY COMO, PINK, PINK FLOYD, PRINCE, PUCCINI, QUEEN, RADIOHEAD, RAMONES, RAVEL, ' +
    'RAY CHARLES, REBA, REM, RIHANNA, ROY ORBISON, RUN DMC, RUSH, SANTANA, SELENA, SHAKIRA, SHANIA TWAIN, SIA, SINATRA, ' +
    'FRANK SINATRA, SOUSA, SPRINGSTEEN, STEELY DAN, STEVIE WONDER, STING, SUPREMES, TAYLOR SWIFT, TEMPTATIONS, THE CLASH, ' +
    'THE DOORS, THE KINKS, THE WHO, TOM PETTY, TOOL, TOTO, U2, USHER, VAN HALEN, VERDI, VIVALDI, WAGNER, WEEZER, WHITNEY, ' +
    'WILLIE NELSON, YES, ' +
    'ALABAMA, ALAN JACKSON, ALICIA KEYS, ASIA, BILLIE EILISH, BJORK, BOY GEORGE, BRAD PAISLEY, BRITNEY, BRUNO MARS, CAROLE KING, ' +
    'CARLY SIMON, CHAKA KHAN, CLAPTON, CYNDI LAUPER, DAVID BOWIE, DIANA ROSS, DUA LIPA, DURAN DURAN, ED SHEERAN, ENYA, ETTA JAMES, ' +
    'EUROPE, GEORGE STRAIT, GLADYS KNIGHT, HANK WILLIAMS, HARRY STYLES, HOZIER, HUEY LEWIS, IGGY POP, JAMES BROWN, JAMES TAYLOR, ' +
    'JANET JACKSON, JIMMY BUFFETT, JOHN DENVER, JOHN LENNON, JONI MITCHELL, KANSAS, KATY PERRY, KEITH URBAN, KENNY CHESNEY, ' +
    'KENNY G, KENNY ROGERS, LADY GAGA, LIZZO, LORETTA LYNN, LUKE BRYAN, LUKE COMBS, MARVIN GAYE, MCCARTNEY, MEAT LOAF, ' +
    'MERLE HAGGARD, MILEY CYRUS, MOBY, MORRISSEY, NORAH JONES, OTIS REDDING, PAUL SIMON, PHIL COLLINS, PRESLEY, RINGO, ' +
    'ROD STEWART, SADE, SAM COOKE, SEAL, STREISAND, SUPERTRAMP, THE BYRDS, THE CARS, THE POLICE, TIM MCGRAW, TINA TURNER, ' +
    'VAN MORRISON, WEIRD AL, WHAM, ZZ TOP');
  var STYLES = words('A CAPPELLA, AMBIENT, BAROQUE, BEBOP, BIG BAND, BLUEGRASS, BLUES, BOSSA NOVA, CAJUN, CALYPSO, CLASSICAL, ' +
    'COUNTRY, DISCO, DOO WOP, EMO, FOLK, FUNK, GOSPEL, GRUNGE, HARD ROCK, HIP HOP, HOUSE, INDIE, JAZZ, K POP, LATIN, MARIACHI, ' +
    'METAL, MOTOWN, NEW WAVE, OPERA, POLKA, POP, PUNK, R AND B, RAP, REGGAE, ROCK, ROCKABILLY, SALSA, SKA, SOFT ROCK, SOUL, ' +
    'SWING, TANGO, TECHNO, TRANCE, WALTZ, ZYDECO, ' +
    'AFROBEAT, ART ROCK, BLUES ROCK, BOOGIE WOOGIE, CHA CHA, DANCEHALL, DUBSTEP, FLAMENCO, FOLK ROCK, GLAM ROCK, HONKY TONK, ' +
    'JAZZ FUSION, KLEZMER, MADRIGAL, MAMBO, MERENGUE, NEW AGE, PSYCHEDELIC, RAGTIME, RUMBA, SAMBA, SHOWTUNES, SURF ROCK, ' +
    'SYNTH POP, TEJANO, WESTERN SWING, YODELING');
  var SONGS = words('ABC, AMAZING GRACE, AMERICAN PIE, ANGIE, ANTI HERO, AT LAST, AULD LANG SYNE, BACK IN BLACK, BAD, BAD GUY, ' +
    'BEAT IT, BILLIE JEAN, BLANK SPACE, CLEMENTINE, CLOCKS, CRAZY, CREEP, CRUEL SUMMER, DANCING QUEEN, DANNY BOY, DESPACITO, ' +
    'DESPERADO, DIXIE, ENTER SANDMAN, FERNANDO, FIREWORK, FREE BIRD, GLORIA, GREENSLEEVES, HALO, HAPPY, HELLO, HELP, HEY JUDE, ' +
    'HOUND DOG, HYSTERIA, IMAGINE, IRONIC, JINGLE BELLS, JOHNNY B GOODE, JOLENE, JUMP, KILLER QUEEN, LA BAMBA, LAYLA, LEAN ON ME, ' +
    'LET IT BE, LET IT GO, LEVITATING, LIKE A PRAYER, LOUIE LOUIE, MACARENA, MAMMA MIA, MONEY, MOON RIVER, MY GIRL, MY WAY, ' +
    'PANAMA, PEGGY SUE, PIANO MAN, PURPLE RAIN, RADIO GAGA, RESPECT, RING OF FIRE, ROAR, ROCKET MAN, ROXANNE, SATISFACTION, ' +
    'SHAKE IT OFF, SHOUT, SILENT NIGHT, SMOOTH, STAND BY ME, STAYIN ALIVE, SUMMERTIME, TAKE ON ME, THRILLER, TINY DANCER, ' +
    'UPTOWN FUNK, VOGUE, VOLARE, WALK THE LINE, WATERLOO, WILD THING, WONDERWALL, YANKEE DOODLE, YELLOW, ' +
    'YESTERDAY, YMCA, ' +
    'AIDA, ALL OF ME, BELIEVER, BLUE BAYOU, BOLERO, CALL ME, CANON IN D, CARMEN, CHANDELIER, CLAIR DE LUNE, CRAZY TRAIN, ' +
    'DAY TRIPPER, DOWNTOWN, DREAM ON, DREAMS, EL PASO, FAITH, FREEDOM, FUR ELISE, GOLD, GREEN ONIONS, HALLELUJAH, HEROES, HURT, ' +
    'JAMBALAYA, KARMA, KODACHROME, KOKOMO, LOSE YOURSELF, MANIAC, MESSIAH, MRS ROBINSON, MY SHARONA, NUTCRACKER, ODE TO JOY, ' +
    'OYE COMO VA, PARANOID, POKER FACE, PRIDE, REHAB, ROCKY TOP, RUNAWAY, SEPTEMBER, SHE LOVES YOU, SHERRY, SPACE ODDITY, SUNNY, ' +
    'SUPERSTITION, SWAN LAKE, TAKE FIVE, TAKE IT EASY, TEQUILA, THUNDER, TORN, TOXIC, TUTTI FRUTTI, UMBRELLA, UNDER THE SEA, ' +
    'VALERIE, VENUS, WALK ON BY, WANNABE, WE ARE FAMILY, WILLIAM TELL, WINDY, WIPEOUT, YOUR SONG, ZOMBIE');
  var MUSIC_WORDS = words('ACCORDION, ALBUM, ALLEGRO, ANTHEM, BALLAD, BAND, BANJO, BASS, BEAT, BRIDGE, CELLO, CHOIR, CHORD, ' +
    'CHORUS, CLARINET, CLEF, CONCERT, CONDUCTOR, CRESCENDO, DJ, DRUMS, DUET, ENCORE, FLAT, FLUTE, GRAMMY, GUITAR, HARMONICA, ' +
    'HARP, JUKEBOX, KARAOKE, LULLABY, MAESTRO, MELODY, OBOE, OCTAVE, ORCHESTRA, ORGAN, OVERTURE, PIANO, QUARTET, REMIX, RHYTHM, ' +
    'ROADIE, SAX, SCALE, SETLIST, SHARP, SINGLE, SOLO, TEMPO, TOP 40, TREBLE, TRIO, TRUMPET, TUBA, UKULELE, VERSE, VINYL, VIOLIN, ' +
    'ALTO, AMPLIFIER, ARIA, BARITONE, BASSOON, BATON, BUGLE, CADENCE, CASTANETS, CD, CHIMES, COWBELL, CYMBAL, DIVA, FIDDLE, FORTE, ' +
    'GIG, GONG, HARMONY, HEADLINER, HIT, HYMN, KAZOO, KEY, LUTE, MANDOLIN, MARIMBA, MEASURE, METRONOME, MICROPHONE, MIXTAPE, ' +
    'NOTE, OPUS, PERCUSSION, PICCOLO, PLAYLIST, RECITAL, REFRAIN, RIFF, SERENADE, SITAR, SNARE, SOPRANO, STEREO, STRINGS, ' +
    'SYMPHONY, SYNTH, TAMBOURINE, TENOR, TIMPANI, TROMBONE, TUNE, TURNTABLE, VIOLA, VOCALS, WOODWIND, XYLOPHONE, YODEL');
  function music() {
    return pick(weighted([[4, ARTISTS], [3, SONGS], [2, STYLES], [2, MUSIC_WORDS]]));
  }

  /* ---------------- dealing ---------------- */
  var MAKERS = { numbers: number, callsigns: callSign, names: name, qths: qth, movies: movie, music: music };
  function deal(id, n) {
    var make = MAKERS[id], out = [], seen = {};
    for (var tries = 0; out.length < n && tries < 500; tries++) {
      var a = make();
      // One appearance per game: compare without spaces, so QTH OHIO and
      // OHIO count as the same place, and NAME BOB and BOB the same name.
      var key = a.replace(/^(QTH IS |QTH |NR |GRID |NAME HR |NAME IS |NAME |OP IS |OP |OM |YL |UR RST |RST |UR |TEMP IS |TEMP |WX )/, '').replace(/ /g, '');
      if (seen[key]) continue;
      seen[key] = true;
      out.push(a);
    }
    return out;
  }

  window.JeopardyAnswers = {
    ids: Object.keys(MAKERS),
    make: function (id) { return MAKERS[id](); },
    deal: deal,
    // For checking the rules (see the note at the top).
    _lists: { MEN: MEN, WOMEN: WOMEN, CARS: CARS, PLACES: PLACES, US_CITIES: US_CITIES, STATES: STATES, COUNTRIES: COUNTRIES,
              WORLD_CITIES: WORLD_CITIES, MOVIE_TITLES: MOVIE_TITLES, ACTORS: ACTORS, CHARACTERS: CHARACTERS, MOVIE_WORDS: MOVIE_WORDS,
              ARTISTS: ARTISTS, STYLES: STYLES, SONGS: SONGS, MUSIC_WORDS: MUSIC_WORDS },
    _nameOnly: nameOnly
  };
})();
