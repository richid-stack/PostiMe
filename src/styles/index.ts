// Load order matters: fonts, Tailwind, the app stylesheet, then the PostiMe theme layer on top.
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '../theme/boot';
import './tailwind.css';
import '../../index.css';
import '../../theme/accents.css';
import '../../theme/postime.css';
