<?php

// Deliberately broken, to match the captured error in tests/fixtures/artisan-error.txt

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', fn () => $this->comment(Inspiring::quote()));
Artisan::command("app:hello" oops, fn () => $this->info("hi"))->purpose("Say hi");
