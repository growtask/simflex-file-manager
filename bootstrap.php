<?php

// an example on handling the FileManager backend.
// move this file to the root of your application.

require 'vendor/autoload.php';

$mgr = new \Simflex\FileManager\Manager(dirname(__FILE__), function () {
    return true;
});

$mgr->handleRequest();