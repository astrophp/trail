<?php

/*
|--------------------------------------------------------------------------
| STAND-IN for a Laravel Octane interface. This is not the real package.
|--------------------------------------------------------------------------
|
| Trail listens for Octane's OperationTerminated by name without depending on
| Octane. This empty interface lets one test dispatch an event object that
| implements it, to prove the dispatcher delivers it to that listener. It is
| loaded only by that test, and only when the real interface is not present.
|
*/

namespace Laravel\Octane\Contracts;

if (! interface_exists(OperationTerminated::class)) {
    interface OperationTerminated {}
}
