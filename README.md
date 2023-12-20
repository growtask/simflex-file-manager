# Simflex File Manager

A simple, clean and fast File Manager with mobile UI support.

## Requirements
- PHP 8.0 or higher

## Installation:
1. Execute `composer require growtask/simflex-file-manager`
2. Copy the `bootstrap.php` file to the root of your website
3. Include `assets/css/style.min.css` to the `head` and `assets/js/app.min.js` to the end of `body` on your page
4. Output HTML content from `tpl/index.tpl` before `assets/js/app.min.js` is included
5. Set `window.fileManager.assetsDir` to `assets` folder
6. Invoke `window.fileManager.init();`

Additionally, you can pass a callback `(path)` to the `init` function in order to receive the selected path.

## Additional configuration

All required parameters are passed to the `Manager` class constructor:
- `root` - root directory (absolute path)
- `authFn` - authentication test function

If your handler file is named differently from `bootstrap.php`, or located in a different path then change `window.fileManager.apiBase` to a different location.

Additionally, if you are using custom root directory, set `window.fileManager.rootDir` appropriately. 