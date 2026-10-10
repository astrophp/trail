<?php

namespace Astro\Trail\Tests\Fixtures\Capture;

/**
 * The worst text a user could send to the redaction patterns, for each pattern: its own prefix
 * repeated, a near match repeated, and a long run of its characters.
 */
final class Hostile
{
    /**
     * @return array<string, string> each text is exactly $size bytes
     */
    public static function inputs(int $size): array
    {
        $repeat = fn (string $unit): string => substr(str_repeat($unit, intdiv($size, strlen($unit)) + 1), 0, $size);
        $run = fn (string $prefix, string $character = 'a'): string => substr($prefix.str_repeat($character, $size), 0, $size);
        $a = fn (int $count): string => str_repeat('a', $count);

        return [
            'bearer prefix' => $repeat('Bearer '),
            'bearer run' => $run('Bearer '),
            'bearer spaces' => $run('Bearer', ' '),
            'bearer near match' => $repeat('Bearer '.$a(60).' '),
            'bearer just short' => $repeat('Bearer '.str_repeat('a1', 7).' '),
            'basic prefix' => $repeat('authorization: basic '),
            'basic spaces' => $run('authorization: basic', ' '),
            'basic label spaces' => $run('Authorization', ' '),
            'url scheme' => $repeat('http://'),
            'url short scheme' => $repeat('ab://a:b'),
            'url near match' => $repeat('http://'.str_repeat('u', 100).':'.str_repeat('p', 100).' '),
            'url user run' => $run('http://u'),
            'url password run' => $run('http://u:p'),
            'url letters' => $repeat('ab'),
            'provider prefix' => $repeat('sk-'),
            'provider near match' => $repeat('sk-'.$a(23).' '),
            'provider segments' => $repeat('sk-'.str_repeat('abcdefghij-', 5).'x '),
            'provider hyphens' => $repeat('sk-a-'),
            'provider run' => $run('sk-'),
            'letters' => $run('', 'a'),
            'stripe prefix' => $repeat('sk_live_'),
            'github prefix' => $repeat('ghp_'),
            'github near match' => $repeat('ghp_'.$a(35).' '),
            'github run' => $run('ghp_'),
            'github pat prefix' => $repeat('github_pat_'),
            'gitlab prefix' => $repeat('glpat-'),
            'slack prefix' => $repeat('xoxb-'),
            'slack app prefix' => $repeat('xapp-1-'),
            'slack webhook prefix' => $repeat('https://hooks.slack.com/services/T0000000/B0000000/'),
            'slack webhook run' => $run('https://hooks.slack.com/services/', 'A'),
            'sendgrid prefix' => $repeat('SG.'.$a(22).'.'),
            'npm near match' => $repeat('npm_'.$a(35)),
            'hugging face prefix' => $repeat('hf_'),
            'hugging face run' => $run('hf_'),
            'twilio near match' => $repeat('SK'.$a(31)),
            'google near match' => $repeat('AIza'.$a(34)),
            'aws id prefix' => $repeat('AKIA'),
            'aws label prefix' => $repeat('aws_secret_key'),
            'aws label spaces' => $run('aws secret key', ' '),
            'aws near match' => $repeat('aws_secret_key="'.$a(39).'" '),
            'azure prefix' => $repeat('AccountKey='),
            'azure run' => $run('AccountKey=', 'A'),
            'jwt dash prefix' => $repeat('eyJ-'),
            'jwt dash dot' => $repeat('eyJ-aaaaaaaaaaa.'),
            'jwt run' => $run('eyJ'),
            'jwt two parts' => $repeat('eyJaaaaaaaaaaa.eyJaaaaaaaaaaa '),
            'pem begin' => $repeat('-----BEGIN PRIVATE KEY-----'),
            'pem begin and body' => $repeat('-----BEGIN PRIVATE KEY-----'.$a(50)),
            'pem body' => $run('-----BEGIN PRIVATE KEY-----'),
            'pem labels' => $repeat('-----BEGIN A B C D E '),
            'pem single dashes' => $run('-----BEGIN PRIVATE KEY-----', 'a-'),
            'pem escaped' => $repeat('-----BEGIN PRIVATE KEY-----\\n'.str_repeat('AB', 30).'\\n'),
            'dashes' => $run('', '-'),
            'key quotes' => $run('', '"'),
            'key name run' => $repeat('"'.$a(64)),
            'key single quote run' => $repeat("'".$a(63).'x'),
            'key and value' => $repeat('"password":"'),
            'key without colon' => $repeat('"password"'),
            'key mixed quotes' => $repeat("'password':'\"password\":\""),
            'key escaped' => $repeat('\\"password\\":\\"'),
            'key escaped quotes' => $repeat('\\"'),
            'key suffix' => $repeat('"'.str_repeat('x', 58).'password'),
            'key separators' => $repeat('"p_a_s_s_w_o_r_d_'),
            'key spaces' => $run('"password":', ' '),
            'key value run' => $run('"password":"'),
            'key value backslashes' => $run('"password":"', '\\'),
            'key escaped value' => $run('\\"password\\":\\"', '\\'),
            'realistic json' => $repeat('{"id":12345,"name":"Ada Lovelace","tags":["a","b"],"nested":{"x":1.5,"y":"some text"},"password":"hunter2"},'),
            'prose' => $repeat('The quick brown fox jumps over the lazy dog. '),
        ];
    }
}
