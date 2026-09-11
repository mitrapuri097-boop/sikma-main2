import React from 'react';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  showBackButton?: boolean;
  onBackClick?: () => void;
  title?: string;
  currentPage?: 'tentangkami' | 'kerawanan' | 'kejadian' | 'home';
}

const Header: React.FC<HeaderProps> = ({ 
  showBackButton = false, 
  onBackClick,
  title,
  currentPage = 'home'
}) => {
  const navigate = useNavigate();

  const handleNavigate = (path: string) => {
    navigate(path);
  };


};

export default Header;