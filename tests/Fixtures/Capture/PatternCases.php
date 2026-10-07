<?php

namespace Astro\Trail\Tests\Fixtures\Capture;

/**
 * What each default redaction pattern must and must not touch, in the order of
 * Payload::DEFAULT_PATTERNS, and ordinary content that no pattern may touch.
 *
 * Every value here is made up. Some are put together from pieces rather than written out, so that
 * secret scanners do not mistake a test value for a real credential.
 */
final class PatternCases
{
    /**
     * @return list<array{name: string, positives: array<string, string>, negatives: list<string>}>
     */
    public static function all(): array
    {
        $jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r';
        $a = fn (int $count): string => str_repeat('a', $count);

        return [
            [
                'name' => 'bearer token',
                'positives' => [
                    'Bearer abcdefghijklmnop1234567890xyz' => '[redacted]',
                    "Authorization: Bearer {$jwt}" => 'Authorization: [redacted]',
                    'bearer 0123456789abcdefghijkl' => '[redacted]',
                    'BEARER 0123456789abcdefghijkl' => '[redacted]',
                    'Bearer opaque_token_with_underscores_abcdef' => '[redacted]',
                ],
                'negatives' => [
                    'The bearer administrative-responsibilities are listed',
                    'The bearer of this letter should present the token at the desk.',
                    'Bearer shortvalue',
                    'Bearer abcdefghijklmnopqrstuvwxyz',
                    'bearer-of-bad-news',
                ],
            ],
            [
                'name' => 'basic credential',
                'positives' => [
                    'Authorization: Basic dXNlcjpwYXNzd29yZA==' => 'Authorization: Basic [redacted]',
                    'authorization=basic dXNlcjpwYXNzd29yZA' => 'authorization=basic [redacted]',
                    '\"Authorization\": \"Basic dXNlcjpwYXNzd29yZA==\"' => '\"Authorization\": \"Basic [redacted]\"',
                ],
                'negatives' => [
                    'Basic information about the thing',
                    'Authorization: Basic',
                    'The Authorization header uses the Basic scheme.',
                ],
            ],
            [
                'name' => 'password in a url',
                'positives' => [
                    'postgres://admin:s3cr3t@db.internal:5432/app' => 'postgres://admin:[redacted]@db.internal:5432/app',
                    'see https://user:p%40ss@example.com/x now' => 'see https://user:[redacted]@example.com/x now',
                    'amqps://u:pw:with:colons@host' => 'amqps://u:[redacted]@host',
                ],
                'negatives' => [
                    'https://example.com:8080/path',
                    'https://user@host/',
                    'ssh://git@github.com:org/repo.git',
                    'http://localhost:3000 and mail me@example.com',
                    'Note: see section 4: at the end',
                ],
            ],
            [
                'name' => 'provider key',
                'positives' => [
                    'sk-abcdefghijklmnopqrstuvwxyz0123456789ABCD' => '[redacted]',
                    'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd' => '[redacted]',
                    'sk-proj-abcdEFGH1234_ijklMNOP5678-qrstUVWX' => '[redacted]',
                    'sk-proj-'.str_repeat('abcdefghij', 4) => '[redacted]',
                    'sk-'.str_repeat('Ab3', 16) => '[redacted]',
                    'use sk-'.str_repeat('x', 30).', then stop' => 'use [redacted], then stop',
                ],
                'negatives' => [
                    'class="pk-button-primary-2024-large-version"',
                    'We use sk-learn-pipeline-configuration for modelling.',
                    'risk-assessment-framework-2024-overview',
                    'sk-short',
                    'task-force-assessment-framework-evaluation',
                ],
            ],
            [
                'name' => 'stripe key',
                'positives' => [
                    'sk_live_abcdefghijklmnop1234' => '[redacted]',
                    'rk_test_abcdefghijklmnop1234' => '[redacted]',
                ],
                'negatives' => ['sk_live_short', 'task_live_abcdefghijklmnop1234', 'sk_prod_abcdefghijklmnop1234'],
            ],
            [
                'name' => 'github token',
                'positives' => [
                    'ghp_abcdefghijklmnopqrstuvwxyz0123456789' => '[redacted]',
                    'gho_abcdefghijklmnopqrstuvwxyz0123456789' => '[redacted]',
                    'ghs_abcdefghijklmnopqrstuvwxyz0123456789' => '[redacted]',
                ],
                'negatives' => ['ghp_short', 'ghp_'.$a(35), 'ghx_abcdefghijklmnopqrstuvwxyz0123456789'],
            ],
            [
                'name' => 'github fine grained token',
                'positives' => ['github_pat_11ABCDEFG0abcdefghijkl_mnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef' => '[redacted]'],
                'negatives' => ['github_pat_short', 'the github_pat flag'],
            ],
            [
                'name' => 'gitlab token',
                'positives' => ['glpat-'.$a(20) => '[redacted]', 'token gl'.'pat-abcDEF_123-456ghiJKL ok' => 'token [redacted] ok'],
                'negatives' => ['glpat-short', 'glpat-'.$a(19), 'the glpat flag'],
            ],
            [
                'name' => 'slack token',
                'positives' => ['xoxb-1234567890-abcdefghijkl' => '[redacted]', 'xoxp-1234567890-abcdefghijkl' => '[redacted]'],
                'negatives' => ['xoxb-short', 'xoxz-1234567890-abcdefghijkl'],
            ],
            [
                'name' => 'slack app token',
                'positives' => ['xapp-1-A0123456789-abcdefghijkl' => '[redacted]'],
                'negatives' => ['xapp-1-short', 'xapp-x-A0123456789-abcdefghijkl'],
            ],
            [
                'name' => 'slack webhook url',
                'positives' => [
                    'https://hooks.slack.com/services/'.'T00000000/B00000000/'.str_repeat('X', 24) => '[redacted]',
                    'post to https://hooks.slack.com/triggers/'.'T0000000AB/12345678901/'.'abcdefghijklmnopqrstuvwx now' => 'post to [redacted] now',
                ],
                'negatives' => [
                    'https://hooks.slack.com/services/docs',
                    'https://slack.com/help',
                    'https://hooks.slack.com/services/T00000000/B00000000/short',
                ],
            ],
            [
                'name' => 'sendgrid key',
                'positives' => ['SG.'.$a(22).'.'.str_repeat('b-', 21).'b' => '[redacted]'],
                'negatives' => ['SG.'.$a(22).'.'.str_repeat('b', 20), 'SG.short.short', 'SG.'.$a(21).'.'.str_repeat('b', 43), 'SG.'.$a(22).'.'.str_repeat('b', 44)],
            ],
            [
                'name' => 'npm token',
                'positives' => ['npm_'.$a(36) => '[redacted]', '//registry.npmjs.org/:_authToken=npm_'.$a(36) => '//registry.npmjs.org/:_authToken=[redacted]'],
                'negatives' => ['npm_'.$a(35), 'npm_'.$a(37), 'npm_install_all'],
            ],
            [
                'name' => 'hugging face token',
                'positives' => ['hf_'.$a(34) => '[redacted]', 'hf_'.$a(30) => '[redacted]'],
                'negatives' => ['hf_short', 'hf_'.$a(29), 'a_hf_'.$a(34)],
            ],
            [
                'name' => 'twilio api key sid',
                'positives' => ['SK'.str_repeat('a1', 16) => '[redacted]', 'sid S'.'K'.str_repeat('0123456789abcdef', 2).' ok' => 'sid [redacted] ok'],
                'negatives' => ['SK'.str_repeat('a1', 15).'a', 'SK'.str_repeat('a1', 17), 'SKU-12345', 'S'.'K'.str_repeat('0123456789ABCDEF', 2)],
            ],
            [
                'name' => 'google api key',
                'positives' => ['AIzaSyA1234567890abcdefghijklmnopqrstuv' => '[redacted]'],
                'negatives' => ['AIza'.$a(34), 'AIza'.$a(36)],
            ],
            [
                'name' => 'aws access key id',
                'positives' => ['AKIAIOSFODNN7EXAMPLE' => '[redacted]', 'ASIAIOSFODNN7EXAMPLE' => '[redacted]'],
                'negatives' => ['AKIAIOSFODNN7EXAMPL', 'AKIAIOSFODNN7EXAMPLEX', 'AKIA is a prefix'],
            ],
            [
                'name' => 'aws secret access key with its label',
                'positives' => [
                    'aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' => '[redacted]',
                    'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' => '[redacted]',
                    '\"aws_secret_access_key\":\"wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\"' => '\"[redacted]\"',
                ],
                'negatives' => [
                    'aws secret keys are rotated monthly by the platform team',
                    'aws_secret_access_key = tooshort',
                    'aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEYXX',
                ],
            ],
            [
                'name' => 'azure storage account key',
                'positives' => [
                    'AccountName=x;AccountKey='.base64_encode(str_repeat('k', 64)).';EndpointSuffix=core.windows.net' => 'AccountName=x;[redacted];EndpointSuffix=core.windows.net',
                ],
                'negatives' => ['AccountKey=short', 'The AccountKey field is required', 'AccountKey='],
            ],
            [
                'name' => 'json web token',
                'positives' => [$jwt => '[redacted]', "token {$jwt}." => 'token [redacted].'],
                'negatives' => ['eyJhbGciOiJIUzI1NiJ9', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'xeyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r'],
            ],
            [
                'name' => 'private key block',
                'positives' => [
                    "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA7\nabc123==\n-----END RSA PRIVATE KEY-----" => '[redacted]',
                    "-----BEGIN ENCRYPTED PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-128-CBC,AB\n\nMIIE\n-----END ENCRYPTED PRIVATE KEY----- tail" => '[redacted] tail',
                    '"-----BEGIN PRIVATE KEY-----\nMIIE\nabc\n-----END PRIVATE KEY-----\n"' => '"[redacted]\n"',
                    "-----BEGIN PGP PRIVATE KEY BLOCK-----\nlQOY\n-----END PGP PRIVATE KEY BLOCK-----" => '[redacted]',
                ],
                'negatives' => [
                    "-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----",
                    "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
                    "-----BEGIN PRIVATE KEY-----\nMIIE\nnever ended",
                ],
            ],
            [
                'name' => 'private key block cut short',
                'positives' => [
                    "before -----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC" => 'before [redacted]',
                    '"-----BEGIN PRIVATE KEY-----\nMIIE\nabc' => '"[redacted]',
                    "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXk=\n-----" => '[redacted]-----',
                ],
                'negatives' => [
                    "-----BEGIN PUBLIC KEY-----\nMIIB",
                    'The PRIVATE KEY is kept elsewhere.',
                    '-----BEGIN-----',
                ],
            ],
        ];
    }

    /**
     * Ordinary content that no pattern, and no part of redaction, may change.
     *
     * @return array<string, string>
     */
    public static function ordinary(): array
    {
        return [
            'prose' => 'The quick brown fox jumps over the lazy dog. Please summarise the attached report in three bullet points.',
            'prose about secrets' => 'Keep your password safe, rotate the token monthly, and never share the secret key or the api key with anyone.',
            'a UUID' => '01a11594-ef63-731d-a3fa-c287cc415461',
            'a git SHA' => 'commit 3f786850e387550fdab836ed7e6dc881de23001b',
            'a sha256 digest' => 'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
            'base64 image data' => 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            'a data uri' => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            'urls without credentials' => 'See https://example.com/docs/getting-started?page=2#install and http://localhost:8000/api/v1/users/42.',
            'a url with a port' => 'Listening on https://example.com:8443/health',
            'css classes' => '<button class="pk-button-primary-2024-large-version rk-card-layout-grid-wide">Save</button>',
            'iso dates' => 'From 2026-10-07T12:00:00Z until 2026-12-31 23:59:59.123456+02:00',
            'a php snippet' => '$user->password = bcrypt($request->input(\'password\')); $token = Str::random(40); return $apiKey;',
            'a js snippet' => 'const apiKey = process.env.API_KEY; fetch(url, { headers: { Authorization: `Bearer ${token}` } });',
            'json that holds nothing sensitive' => '{"name":"Ada","count":3,"input_tokens":"5","max_tokens":"1000","tags":["a","b"]}',
            'sql' => 'SELECT id, email FROM users WHERE password_reset_url IS NULL AND token_count > 5 ORDER BY id;',
            'a long identifier' => 'App\\Http\\Controllers\\Api\\V1\\InternationalizationImplementationController',
            'a file path' => '/var/www/html/storage/framework/views/0123456789abcdef0123456789abcdef.php',
            'a markdown table' => "| key | value |\n|-----|-------|\n| a | 1 |\n----------\n",
            'hex' => 'deadbeef0123456789abcdef0123456789abcdef0123456789abcdef01234567',
            'an email' => 'ada@example.com wrote: Basic information about the Bearer role.',
            'words with sk' => 'Ask-me-anything about whisk-based desk-work, task-lists and risk-registers.',
            'non-ascii prose' => 'Şu metni özetle: 東京は日本の首都です。Привет, мир! 😀',
        ];
    }
}
