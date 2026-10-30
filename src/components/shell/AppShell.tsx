'use client';
import Image from 'next/image';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {accountIdentity,currentNavigation,shellNavigation} from './navigation';
import {Button,NavigationLink} from '../ui/Primitives';
import Icon from '../ui/Icon';

export default function AppShell({children,weddingId,title,active,accountLabel}:{children:ReactNode;weddingId:string|null;title:string;active:boolean;accountLabel:string}){
 const pathname=usePathname(),[hash,setHash]=useState(''),[menuOpen,setMenuOpen]=useState(false),dialog=useRef<HTMLDialogElement>(null),menuButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const update=()=>setHash(window.location.hash);update();window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[pathname]);
 const items=shellNavigation(weddingId,active),current=currentNavigation(pathname,hash);
 function closeMenu(){dialog.current?.close();setMenuOpen(false);}
 function openMenu(){dialog.current?.showModal();setMenuOpen(true);}
 const brand=<Link className="mp-brand" href={weddingId?`/workspace/${weddingId}`:'/workspace'} prefetch={false}><Icon name="ceremonies"/><span>Mandapam</span></Link>;
 const nav=<nav aria-label="Main navigation">{items.map(item=><NavigationLink key={item.key} item={item} current={item.key===current} onNavigate={()=>{setHash(item.href.includes('#')?'#'+item.href.split('#')[1]:'');closeMenu();}}/>)}</nav>;
 return <div className={`mandapam-app ${pathname.endsWith('/tasks')?'mp-tasks-shell':''} ${pathname.endsWith('/ceremonies')?'mp-ceremonies-shell':''}`}>
  <a className="mp-skip" href="#app-content">Skip to wedding workspace</a>
  <aside className="mp-sidebar" aria-label="Mandapam sidebar"><div className="mp-brand-area">{brand}</div>{nav}<div className="mp-sidebar-art" aria-hidden="true"><span className="mp-gold-rule"/><Image src="/mandapam/sidebar-arch.webp" width={400} height={500} alt="" sizes="210px"/><p>A happier<br/>wedding together</p><span className="mp-gold-rule"/></div></aside>
  <div className="mp-application">
   <header className="mp-topbar"><button ref={menuButton} type="button" className="mp-menu-toggle" aria-label="Open main navigation" aria-controls="mp-mobile-navigation" aria-expanded={menuOpen} onClick={openMenu}><Icon name="menu"/></button><div className="mp-context"><Icon name="sun"/><div><p className="mp-greeting"><span className="mp-mobile-brand">{pathname.endsWith('/tasks')||pathname.endsWith('/budget')||pathname.endsWith('/ceremonies')?brand:'Mandapam'}</span><span className="mp-desktop-greeting">Your wedding, thoughtfully planned</span></p><p className="mp-context-title">{title}</p></div></div><div className="mp-account"><span className="mp-avatar" aria-hidden="true">{accountLabel.slice(0,1).toUpperCase()}</span><div className="mp-account-copy"><span>{accountIdentity(accountLabel)}</span><small>{weddingId?'Plan owner':'Your account'}</small></div><form method="post" action="/auth/logout"><Button variant="secondary" className="mp-signout" aria-label="Sign out"><Icon name="logout"/><span>Sign out</span></Button></form></div></header>
   <div id="app-content" className="mp-content" tabIndex={-1}>{children}</div>
  </div>
  <dialog ref={dialog} id="mp-mobile-navigation" className="mp-mobile-drawer" aria-labelledby="mp-menu-title" onCancel={()=>setMenuOpen(false)} onClose={()=>{setMenuOpen(false);menuButton.current?.focus();}}><div className="mp-drawer-heading"><span id="mp-menu-title">Mandapam</span><button type="button" className="mp-drawer-close" aria-label="Close main navigation" onClick={closeMenu}><Icon name="close"/></button></div>{nav}<p className="mp-drawer-note">Your private wedding workspace</p></dialog>
 </div>;
}
