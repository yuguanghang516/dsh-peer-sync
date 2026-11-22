from cryptography import x509
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID
from datetime import datetime,timedelta,timezone
from pathlib import Path
key=ec.generate_private_key(ec.SECP256R1())
n=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'dsh-peer.local')])
now=datetime.now(timezone.utc)
cert=(x509.CertificateBuilder().subject_name(n).issuer_name(n).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-timedelta(days=1)).not_valid_after(now+timedelta(days=730)).add_extension(x509.SubjectAlternativeName([x509.DNSName('dsh-peer.local')]),False).sign(key,hashes.SHA256()))
import argparse,json,secrets,ipaddress
p=argparse.ArgumentParser()
p.add_argument('--two-phones',action='store_true',help='Pair two Android local engines; --phone-ip is phone A')
p.add_argument('--windows-home')
p.add_argument('--windows-workspace')
p.add_argument('--phone-ip',required=True,type=ipaddress.IPv4Address)
p.add_argument('--out',default='private-pair')
a=p.parse_args()
if not a.two_phones and not (a.windows_home and a.windows_workspace):
    p.error('Desktop pairing requires --windows-home and --windows-workspace')
base=Path(a.out);base.mkdir(mode=0o700,exist_ok=False)
secret=secrets.token_hex(32)
for side in (['phone-a','phone-b'] if a.two_phones else ['windows','android']):
    folder=base/side;folder.mkdir(mode=0o700)
    home=Path(a.windows_home).resolve() if side=='windows' else '/root/.dsh'
    workspace=str(Path(a.windows_workspace).resolve()) if side=='windows' else '/root/workspace'
    prefix=str(home).replace('\\','/')
    cfg=dict(device=side,workspace=workspace,exchange=prefix+('/peer-sync-cache-mobile' if a.two_phones else '/peer-sync-cache'),profileDirectory=prefix+'/profiles/'+('desktop' if side=='windows' else 'web'),sharedDirectory=workspace+'/DSH-Shared',portablePlugins=['dsh-free-search'],autoInstallPlugins=['dsh-free-search'])
    cfg['syncAllPlugins']=a.two_phones
    cfg['lan']=dict(key=secret,port=39463,certFile=prefix+'/peer-sync-packages/peer.crt')
    if side in ('android','phone-a'):
        cfg['lan'].update(bind='0.0.0.0',privateKeyFile=prefix+'/peer-sync-packages/peer.key')
        (folder/'peer.key').write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
    else:cfg['lan']['host']=str(a.phone_ip)
    (folder/'peer.crt').write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    (folder/'peer-sync-settings.json').write_text(json.dumps(cfg,indent=2),encoding='utf-8')
print('Private pairing files created:',base.resolve())
