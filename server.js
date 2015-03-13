
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



    var self    = this;

    /**
     * http server
     */
    this.server = this.http.createServer( function( request, response )
    {
        if ( request.method === 'POST' )
        {
            self.handlePost( self, request, response );
        }
        else if ( request.method === 'GET' )
        {
            self.handleGet( self, request, response );
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
 * @param  {obj}                    self                this
 * @param  {obj}                    request             HTTP request
 * @param  {obj}                    response            HTTP response
 *
 * @return {void}
 */
PunkRockAcademy.prototype.handleGet = function( self, request, response )
{
    var variables   = self.url.parse( request.url, true ).query;
    var pathname    = self.url.parse( request.url ).pathname;

    var data = { success : 'you\'ve connected, but didn\'t ask for anything' };

    if ( variables.artist )
    {
        data = { artists:{} };
    }
    else if ( variables.album )
    {
        data = { albums:{} };
    }

    self.outputData( response, data );
};


/**
 * sorts out POST requests
 *
 * @param  {obj}                    self                this
 * @param  {obj}                    request             HTTP request
 * @param  {obj}                    response            HTTP response
 *
 * @return {void}
 */
PunkRockAcademy.prototype.handlePost = function( self, request, response )
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
    var port = this.config.serverPort;

    this.server.listen( port );
    console.log( 'Server is started on port ' + ( port ) );
    this.watchSockets();

    this.loadData( 'library', this._importJSON.bind( this ) );
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
 PunkRockAcademy.prototype.outputData = function( response, data )
{
    if ( typeof data !== 'string' )
    {
        data = JSON.stringify( data );
    }

    response.writeHead( 200, {
                                'Content-Type': 'application/json',
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


