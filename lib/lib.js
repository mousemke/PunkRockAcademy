/**
 * this file should contain functions for sorting the library into 2 seperate
 * json files: ( album & band ) as well as removing duplicates from the library.
 */
module.exports = function( PunkRockAcademy )
{
    /**
     * raise variables
     *
     * @return {void}
     */
    PunkRockAcademy.prototype.lib = function()
    {
        this.lib.library    = this.library;
        this.lib.band     = this.band;
        this.lib.album      = this.album;
    };


    /**
     * sorts the entire library into album and band based lists
     * 
     * @param  {obj}                library             library of albums
     * 
     * @return {void}
     */
    PunkRockAcademy.prototype.lib.sortLibrary = function( self, library )
    {
        var albums = library.albums;

        for ( var i = 0, lenI = albums.length; i < lenI; i++ ) 
        {
            self.lib.sortAlbum( albums[ i ] );
            self.lib.sortBand( albums[ i ] );
        }
    };


    /**
     * 
     *
     * @return {void}
     */
    PunkRockAcademy.prototype.lib.sortAlbum = function( album )
    {
        var albumName               = album.album.toLowerCase();
        this.album[ albumName ]     = album;
    };


    /**
     * 
     *
     * @return {void}
     */
    PunkRockAcademy.prototype.lib.sortBand = function( album )
    {
        var bandName            = album.band.toLowerCase();
        var albumName           = album.album.toLowerCase();
        this.band[ bandName ]               = {};
        this.band[ bandName ][ albumName ]  = album;
        this.band[ bandName ].all           = album;
    };

};