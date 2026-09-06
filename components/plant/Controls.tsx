import React from 'react';
type ButtonProps=React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'default'|'outline'|'ghost';size?:'sm'|'default'};
export function Button({variant='default',size='default',className='',type='button',...props}:ButtonProps){return <button {...props} type={type} data-variant={variant} className={`mx-plant-button mx-plant-button-${size} ${className}`}/>;}
export const Textarea=React.forwardRef<HTMLTextAreaElement,React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({className='',...props},ref){return <textarea {...props} ref={ref} className={`mx-plant-textarea ${className}`}/>;});
export function Label(props:React.LabelHTMLAttributes<HTMLLabelElement>){return <label {...props}/>;}
