import Link from 'next/link';
import type {ButtonHTMLAttributes,HTMLAttributes,ReactNode} from 'react';
import Icon from './Icon';
import type {NavigationItem} from '../shell/navigation';
export function Button({variant='primary',className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'}){return <button className={`mp-button mp-button-${variant} ${className}`} {...props}/>;}
export function Card({className='',...props}:HTMLAttributes<HTMLElement>){return <section className={`mp-card ${className}`} {...props}/>;}
export function PageHeading({children,description}:{children:ReactNode;description?:string}){return <div className="mp-page-heading"><h1>{children}</h1>{description&&<p>{description}</p>}</div>;}
export function StatusBadge({children,tone='neutral'}:{children:ReactNode;tone?:'neutral'|'success'|'warning'|'danger'}){return <span className={`mp-badge mp-badge-${tone}`}>{children}</span>;}
export function Section({title,children}:{title:string;children:ReactNode}){return <section className="mp-section"><h2>{title}</h2>{children}</section>;}
export function StateMessage({kind,children}:{kind:'empty'|'loading'|'error';children:ReactNode}){return <div className={`mp-state mp-state-${kind}`} role={kind==='error'?'alert':kind==='loading'?'status':undefined}>{children}</div>;}
export function NavigationLink({item,current,onNavigate}:{item:NavigationItem;current:boolean;onNavigate:()=>void}){return <Link href={item.href} prefetch={false} className="mp-nav-item" aria-current={current?(item.href.includes('#')?'location':'page'):undefined} onClick={onNavigate}><Icon name={item.key==='family'?'people':item.key}/><span>{item.label}</span></Link>;}
