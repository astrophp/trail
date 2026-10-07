<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>{{ $title }}</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='-10 -16 301 301' fill='none'%3E%3Cdefs%3E%3ClinearGradient id='trail-compact-gradient' x1='172.737' y1='-7.41915' x2='18.294' y2='255.418' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%233C79FD'/%3E%3Cstop offset='1' stop-color='%237954FD'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M276.419 0.0170427L276.671 0.0387467C279.282 0.25569 281.217 2.54906 280.98 5.14643C280.884 6.20664 280.427 7.20404 279.687 7.97278L148.3019 141.7804C141.6384 148.6987 146.0823 161.4852 156.1890 161.4864C159.1709 161.4864 162.0288 160.2875 164.1103 158.1623L203.053 116.032C204.544 114.511 206.625 113.708 208.756 113.833C212.47 114.051 215.438 116.993 215.67 120.689L215.68 120.855C215.786 122.538 215.326 124.199 214.364 125.587C201.929 143.527 188.004 163.546 173.065 185.377C149.347 220.037 125.064 269 76.0086 269C34.0301 268.999 0 235.126 0 193.34C0.000356022 157.508 25.179 133.534 53.3809 115.369C68.7107 105.495 124.325 69.0326 151.431 51.0698C152.939 50.0706 154.747 49.6337 156.548 49.8326L156.678 49.8471C160.834 50.3072 163.829 54.035 163.367 58.1718C163.159 60.0399 162.257 61.7644 160.838 63.0046L112.8412 102.7412C110.5214 104.7696 109.1891 107.6948 109.1880 110.7687C109.1880 119.9963 120.5466 124.2774 127.3470 118.8730L272.901 1.08295C273.893 0.294689 275.153 -0.0878895 276.419 0.0170427ZM31.4086 193.34A44.6 44.6 0 1 0 120.6086 193.34A44.6 44.6 0 1 0 31.4086 193.34Z' fill='url(%23trail-compact-gradient)'/%3E%3C/svg%3E">
    <script{!! $nonce !!}>
        try {
            var saved = localStorage.getItem('trail-theme');
            var dark = saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
            document.documentElement.classList.toggle('dark', dark);
        } catch (e) {}
    </script>
    {{ $css }}
</head>
<body>
    <div id="trail"></div>
    <noscript>Trail needs JavaScript to run.</noscript>
    {{ $js }}
</body>
</html>
