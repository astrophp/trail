<?php

namespace Workbench\App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;

/**
 * A customer of the shop the workbench agents work for. Users are not traces: the scenarios that
 * remember a conversation need someone to own it.
 */
class User extends Authenticatable
{
    protected $table = 'users';

    protected $guarded = [];

    protected $hidden = ['password', 'remember_token'];
}
