var config = {
    serverPath              : 'http://your.web.address',
    serverPort              : 56665,

    importDir               : './import/'
};

var PunkRockAcademy = PunkRockAcademy || null;

if ( PunkRockAcademy )
{
    PunkRockAcademy.prototype.config = config;
}
else
{
    module.exports = config;
}

// redirects a port to port 80
// sudo iptables -A PREROUTING -t nat -i eth0 -p tcp --dport 80 -j REDIRECT --to-port 56665

// undo that
// sudo iptables -D PREROUTING -t nat -i eth0 -p tcp --dport 80 -j REDIRECT --to-port 56665

// screen
// screen -r