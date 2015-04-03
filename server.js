
/* global document, window, µ, require, console, setTimeout */
/*jshint globalstrict: true*/
'use strict';

/**
 * Punk Rock Academy
 *
 * This project is designed not only to catalog peoples favorite music, but also
 * to see the influential 'classics' in other peoples world, and why they affected
 * the people as they did.
 *
 * Contains general functions for starting the academy, as
 * well as holding some app wide variables
 *
 * @author  Mouse Braun <mouse@knoblau.ch>
 */
var PunkRockAcademy = function()
{
    /**
     * load tools
     */
    this.url    = require( 'url' );
    this.fs     = require( 'fs' );
    this.http   = require( 'http' );

    /*
     * load config file
     */
    this.config = require( './config/' );

    /*
     * loads the library tools
     */
    require( './lib/lib' )( PunkRockAcademy );

    this.library = {
        albums :    []
    };

    this.band   = {};
    this.album  = {};

    var self    = this;

    /**
     * http server
     */
    this.server = this.http.createServer( function( request, response )
    {
        if ( request.method === 'POST' )
        {
            self.handlePost( request, response );
        }
        else if ( request.method === 'GET' )
        {
            self.handleGet( request, response );
        }
    } );

    this.ini();

    return this;
};


/**
 * builds the full filename
 *
 * @param  {str}                    filename            unmodified filename
 * @param  {bool}                   _import             whether or not this is an import
 * 
 * @return {str}                                        standardized filename
 */
PunkRockAcademy.prototype.buildFilename = function( filename, _import )
{
    var folder  = ( _import === true ) ? 'import/' : 'lib/json/';
    filename    = folder + filename;

    var fLen    = filename.length;
    if ( filename.slice( fLen - 5, fLen ).toLowerCase() !== '.json' )
    {
        filename += '.json';
    }

    return filename;
};


/**
 * deletes a file
 * 
 * @param  {str}                    file                file to remove
 * 
 * @return {void}
 */
PunkRockAcademy.prototype.deleteFile = function( file )
{
    this.fs.unlink( file, function( err ) 
    {
        if ( err )
        {
            console.log( err );
        };
    });
};


/**
 * sorts out GET requests
 *
 * @param  {obj}                    request             HTTP request
 * @param  {obj}                    response            HTTP response
 *
 * @return {void}
 */
PunkRockAcademy.prototype.handleGet = function( request, response )
{
    var variables       = this.url.parse( request.url, true ).query;
    var pathnameSplit   = this.url.parse( request.url ).pathname.split( '/' );

    if ( pathnameSplit[ pathnameSplit.length - 1 ] === '' && pathnameSplit.length > 2 )    
    {
            pathnameSplit = pathnameSplit.slice( 0, pathnameSplit.length - 1 );   
    }
    var pathname = pathnameSplit.join( '/' )

    var dataType, data;

    if ( pathnameSplit[1] === '10' && pathnameSplit[2] )
    {
        this.tenInfluences( pathnameSplit[2], pathnameSplit[3], response );
    }
    else
    {
        if ( JSON.stringify( variables ) !== '{}' )
        {
            dataType    = 'json';
            data        = this.library;

            if ( variables.band )
            {
                data = this.band;
            }
            else if ( variables.album )
            {
                data = this.album;
            }
        }
        else
        {
            data        = this.static[ pathname ];

            if ( data )
            {
                dataType    = data[1];
                data        = data[0];
            }
        }

        if ( !data )
        {
            data = this.static.fourOhFour[0];
            dataType    = 'html';
        }

        this.outputData( response, data, dataType );
    }
};


/**
 * sorts out POST requests
 *
 * @param  {obj}                    request             HTTP request
 * @param  {obj}                    response            HTTP response
 *
 * @return {void}
 */
PunkRockAcademy.prototype.handlePost = function( request, response )
{
    // var body = '';

    // request.on( 'data', function( data )
    // {
    //     body += data;
    // } );

    // request.on( 'end', function()
    // {
    //     body = JSON.parse( body );

    //     response.writeHead(
    //         "200",
    //         "OK",
    //         {
    //             "access-control-allow-origin": request.headers.origin || '*',
    //             "content-type": "application/json",
    //             "content-length": body.length
    //         }
    //     );

    //     response.write( 'the goggles do nothing!!!!!!' );

    //     response.end( 'success' );
    // } );

    // request.on( 'error', function( e )
    // {
    //     console.log( 'problem with request: ' + e.message );
    // } );
};


/**
 * Start the things! - initiates the server and watches sockets
 *
 * @return {void}
 */
PunkRockAcademy.prototype.ini = function()
{
    this.lib();
    var port = this.config.serverPort;

    this.server.listen( port );
    console.log( 'Server is started on port ' + ( port ) );
    this.watchSockets();

    this.loadData( 'library', this._importJSON.bind( this ) );
    this.setStaticPages();
};


/**
 * auto imports any json file dropped in the import directory
 *
 * @return {void}
 */
PunkRockAcademy.prototype._importJSON = function( library )
{
    var self        = this;
    this.library    = library;
    this.lib.sortLibrary( this, library );

    this.fs.readdir( this.config.importDir, function( err, files )
    {
        var file, ext, fileShort, _files = {};
        for ( var i = 0, lenI = files.length; i < lenI; i++ )
        {
            file = files[ i ];

            ext     = file.split( '.' );
            ext     = ext[ ext.length - 1 ];

            if ( ext === 'json' )
            {
                self.loadData( file, function( data, _file )
                {
                    for ( var f = 0; f < data.albums.length; f++ ) 
                    {
                        library.albums.push( data.albums[ f ] );
                        self.lib.sortAlbum( data.albums[ f ] );
                        self.lib.sortBand( data.albums[ f ] );
                    }

                    fileShort   = _file.split( '/' )[ 1 ];
                    self.saveData( data, fileShort, true );
                    self.library = library;
                    self.saveLibrary( library );
                    self.deleteFile( _file );
                }, true );
            }
        }
    } );
};


/**
 * kills the server after a timeout
 *
 * @param  {int}                    timeout             timeout in seconds
 *
 * @return {void}
 */
PunkRockAcademy.prototype.kill = function( timeout )
{
    timeout     = timeout || 10;
    var self    = this;

    ( function countDown ( counter )
    {
        console.log( counter );
        if ( counter > 0 )
        return setTimeout( countDown, 1000, counter - 1 );

        self.server.close( function () { console.log( 'Server closed' ); } );

        for ( var socketId in self.sockets )
        {
            console.log( 'socket ' + socketId + ' destroyed' );
            self.sockets[ socketId ].destroy();
        }
    } )( timeout );
};


/**
 * loads the json for a passed filename and runs _callback
 *
 * @param  {obj}                    jsonData            json data recieved from page
 * @param  {func}                   _callback           savefile function
 * @param  {bool}                   _import             triggers a dir change for loading
 *
 * @return {void}
 */
PunkRockAcademy.prototype.loadData = function( filename, _callback, _import )
{
    filename = this.buildFilename( filename, _import );
    var self = this;

    this.fs.readFile( filename, 'utf8', function( err, data )
    {
        if ( !data || err )
        {
            var fileExample = filename.split( '.' );
            fileExample.splice( fileExample.length - 1, 0, 'example' );
            fileExample = fileExample.join( '.' );

            self.fs.readFile( fileExample, 'utf8', function( err, data )
            {
                if ( !data || err )
                {
                    console.log( 'Error: ENOENT, open "' + filename + '" (additional failure to get an example file)' );
                }
                else
                {
                    self.saveData( data, filename.split( '/' )[ 2 ] )

                    data = JSON.parse( data );

                    _callback( data, filename );
                }
            } );
        }
        else
        {
            data = JSON.parse( data );

            _callback( data, filename );
        }
    } );
};



/**
 * outputs the supplied data as an http response
 *
 * @param  {obj}                    response            http response object
 * @param  {obj}                    request             http request object
 *
 * @return {void}
 */
 PunkRockAcademy.prototype.outputData = function( response, data, dataType )
{
    if ( typeof data !== 'string' && dataType === 'json' )
    {
        data = JSON.stringify( data );
    }

    switch ( dataType )
    {
        case 'json':
            dataType = 'application/json';
            break;
        case 'js':
            dataType = 'text/javascript;charset=utf-8';
            break;
        case 'css':
            dataType = 'text/css';
            break;
        case 'png':
            dataType = 'image/png';
            break;
        default:
            dataType = 'text/html';
    }

    response.writeHead( 200, {
                                'Content-Type': dataType,
                                'Access-Control-Allow-Origin': '*'
                            } );
    response.write( data );
    response.end();
};


/**
 * saves the recieved json to a file
 *
 * @param  {obj}                    jsonData            json event data
 * @param  {str}                    filename            filename to save to
 *
 * @return {void}
 */
 PunkRockAcademy.prototype.saveData = function( jsonData, filename, _import )
{
    if ( typeof jsonData !== 'string' )
    {
        jsonData = JSON.stringify( jsonData );
    }

    filename = this.buildFilename( filename, _import );

    if ( _import )
    {
        filename = filename.split( '/' );

        filename.splice( 1, 0, '.imported' );
        filename = filename.join( '/' );
    }

    this.fs.writeFile( filename, jsonData, function( err )
    {
        if ( err )
        {
            return console.log( err );
        }
    });
};


/**
 * backs up and then saves the library
 * 
 * @param  {obj}                    newData             data to be saved
 * 
 * @return {void}
 */
PunkRockAcademy.prototype.saveLibrary = function( newData )
{
    var self    = this;
    newData     = JSON.stringify( newData );

    this.loadData( 'library.json', function( data, _file )
    {
        self.saveData( data, 'library.bak' );
        self.saveData( newData, 'library' );
    }, false );
};


PunkRockAcademy.prototype.setStaticPages = function()
{
    this.static = {
        '/'             : [ this.fs.readFileSync( './resources/pages/index.html' ), 'html' ],
        '/10'           : [ this.fs.readFileSync( './resources/pages/10.html' ), 'html' ],
        '/submit'       : [ this.fs.readFileSync( './resources/pages/submit.html' ), 'html' ],

        '/microbe.js'   : [ this.fs.readFileSync( './resources/scripts/microbe.js' ), 'js' ],

        '/style.css'    : [ this.fs.readFileSync( './resources/css/style.css' ), 'css' ],

        '/git.png'      : [ this.fs.readFileSync( './resources/images/git.png' ), 'png' ],

        fourOhFour      : [ this.fs.readFileSync( './resources/pages/404.html' ), 'html' ],
    };
};


PunkRockAcademy.prototype.tenInfluences = function( name, type, response )
{
    var self = this;

    this.fs.readFile( './lib/json/10/' + name + '.10influences.json', 'utf8', function( err, data )
    {
        var dataType = ( type === 'json' ) ? 'json' : 'html';
        self.outputData( response, data, dataType );
    } );
};


/**
 * watches and closes web sockets
 *
 * @return {void}
 */
 PunkRockAcademy.prototype.watchSockets = function()
{
    this.sockets         = {};
    this.nextSocketId    = 0;
    var self = this;

    this.server.on( 'connection', function( socket )
    {
      var socketId              = self.nextSocketId++;
      self.sockets[ socketId ]  = socket;

      console.log( 'socket ' + socketId + ' opened' );

      socket.once( 'close', function ()
      {
        console.log( 'socket ' + socketId + ' closed' );
        delete self.sockets[ socketId ];
      });

      socket.setTimeout( 4000 );
    });
};


var punkrockacademy = new PunkRockAcademy();


