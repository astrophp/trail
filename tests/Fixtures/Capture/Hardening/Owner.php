<?php

namespace Astro\Trail\Tests\Fixtures\Capture\Hardening;

use Illuminate\Database\Eloquent\Model;

class Owner extends Model
{
    protected $table = 'hardening_owners';

    protected $guarded = [];

    public $timestamps = false;
}
