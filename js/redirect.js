// Сайт переїхав: стара адреса веде на нову з тією ж сторінкою (#/map, #/spot/… тощо).
// Окремий файл, а не вбудований <script>: Content-Security-Policy в index.html дозволяє лише скрипти сайту.
if (location.hostname === 'energist.onrender.com') location.replace('https://wattway.onrender.com/' + location.hash);
